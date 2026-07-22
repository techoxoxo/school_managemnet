import { notificationPreferences, notificationQueue, notifications, type Db } from '@schoolmate/db';
import type { Channel } from '@schoolmate/shared';
import { and, eq } from 'drizzle-orm';

/** A relayed outbox event handed to notification handlers. */
export interface DomainEvent {
  id: string;
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string | null;
  payload: Record<string, unknown>;
}

/** One notification a handler wants delivered. */
export interface NotifyIntent {
  /** In-app + preference lookups need a user; external-only can omit it. */
  userId?: string | undefined;
  /** email/phone for external channels. */
  recipient?: string | undefined;
  channels: Channel[];
  title: string;
  body: string;
  subject?: string | undefined;
}

export type EventHandler = (event: DomainEvent) => NotifyIntent[] | Promise<NotifyIntent[]>;

const registry = new Map<string, EventHandler[]>();

/** Modules register interest in an event type (Plan §17 consumers). */
export function registerHandler(eventType: string, handler: EventHandler): void {
  const list = registry.get(eventType) ?? [];
  list.push(handler);
  registry.set(eventType, list);
}

export function clearHandlers(): void {
  registry.clear();
}

async function prefEnabled(
  db: Db,
  tenantId: string,
  userId: string,
  channel: Channel,
  eventType: string,
): Promise<boolean> {
  const [pref] = await db
    .select({ isEnabled: notificationPreferences.isEnabled })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.tenantId, tenantId),
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.channel, channel),
        eq(notificationPreferences.eventType, eventType),
      ),
    )
    .limit(1);
  // Default: opted in. A row only exists when the user changed the setting.
  return pref?.isEnabled ?? true;
}

/**
 * Runs every handler registered for the event and materializes the resulting
 * intents: in-app rows into `notifications`, external channels into
 * `notification_queue` (status=queued) for the queue processor to deliver.
 * Returns how many deliveries were created (for observability/tests).
 */
export async function dispatchEvent(db: Db, event: DomainEvent): Promise<number> {
  const handlers = registry.get(event.eventType) ?? [];
  let created = 0;

  for (const handler of handlers) {
    const intents = await handler(event);
    for (const intent of intents) {
      for (const channel of intent.channels) {
        if (
          intent.userId &&
          !(await prefEnabled(db, event.tenantId, intent.userId, channel, event.eventType))
        ) {
          continue; // user opted out of this channel for this event
        }

        if (channel === 'in_app') {
          if (!intent.userId) continue; // in-app requires a user
          await db.insert(notifications).values({
            tenantId: event.tenantId,
            userId: intent.userId,
            eventType: event.eventType,
            title: intent.title,
            body: intent.body,
            data: (event.payload ?? {}) as never,
          });
        } else {
          await db.insert(notificationQueue).values({
            tenantId: event.tenantId,
            userId: intent.userId ?? null,
            channel,
            recipient: intent.recipient ?? null,
            eventType: event.eventType,
            subject: intent.subject ?? intent.title,
            body: intent.body,
          });
        }
        created += 1;
      }
    }
  }
  return created;
}
