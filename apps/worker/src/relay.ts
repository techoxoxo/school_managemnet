import { notificationQueue, outboxEvents, type Db } from '@schoolmate/db';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { env } from './env.js';
import { dispatchEvent, type DomainEvent } from './notifications/dispatch.js';
import type { SenderRegistry } from './notifications/channels.js';

/**
 * Outbox relay (Plan §17). Reads a batch of unpublished events, dispatches each
 * to notification handlers, and marks it published — all so no event is lost.
 * A failed dispatch increments attempts and leaves the row for the next pass.
 * Returns the number of events successfully published (for tests/metrics).
 *
 * Runs on the admin (BYPASSRLS) connection so it spans every tenant.
 */
export async function drainOutbox(db: Db): Promise<number> {
  const batch = await db
    .select()
    .from(outboxEvents)
    .where(isNull(outboxEvents.publishedAt))
    .orderBy(asc(outboxEvents.createdAt))
    .limit(env.RELAY_BATCH_SIZE);

  let published = 0;
  for (const row of batch) {
    const event: DomainEvent = {
      id: row.id,
      tenantId: row.tenantId,
      eventType: row.eventType,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      payload: (row.payload ?? {}) as Record<string, unknown>,
    };
    try {
      await dispatchEvent(db, event);
      await db
        .update(outboxEvents)
        .set({ publishedAt: new Date() })
        .where(eq(outboxEvents.id, row.id));
      published += 1;
    } catch (err) {
      await db
        .update(outboxEvents)
        .set({
          attempts: row.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        })
        .where(eq(outboxEvents.id, row.id));
    }
  }
  return published;
}

/**
 * Delivers queued external-channel notifications. Each is sent through its
 * channel's provider; success → sent, failure → retry until MAX_DELIVERY_ATTEMPTS
 * then failed. In-app notifications are not queued here (written at dispatch).
 */
export async function processQueue(db: Db, senders: SenderRegistry): Promise<number> {
  const batch = await db
    .select()
    .from(notificationQueue)
    .where(
      and(
        eq(notificationQueue.status, 'queued'),
        lt(notificationQueue.attempts, env.MAX_DELIVERY_ATTEMPTS),
      ),
    )
    .orderBy(asc(notificationQueue.createdAt))
    .limit(env.RELAY_BATCH_SIZE);

  let sent = 0;
  for (const row of batch) {
    const sender = senders[row.channel];
    if (!sender) {
      await db
        .update(notificationQueue)
        .set({ status: 'skipped', lastError: `no sender for channel ${row.channel}` })
        .where(eq(notificationQueue.id, row.id));
      continue;
    }
    if (!row.recipient) {
      await db
        .update(notificationQueue)
        .set({ status: 'failed', lastError: 'missing recipient' })
        .where(eq(notificationQueue.id, row.id));
      continue;
    }
    try {
      await sender.send({ recipient: row.recipient, subject: row.subject, body: row.body });
      await db
        .update(notificationQueue)
        .set({ status: 'sent', sentAt: new Date(), attempts: row.attempts + 1 })
        .where(eq(notificationQueue.id, row.id));
      sent += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      await db
        .update(notificationQueue)
        .set({
          attempts,
          status: attempts >= env.MAX_DELIVERY_ATTEMPTS ? 'failed' : 'queued',
          lastError: err instanceof Error ? err.message : String(err),
        })
        .where(eq(notificationQueue.id, row.id));
    }
  }
  return sent;
}

/** Old published events can be pruned periodically to keep the outbox small. */
export async function pruneOutbox(db: Db, olderThanDays = 7): Promise<void> {
  await db
    .delete(outboxEvents)
    .where(
      and(
        sql`${outboxEvents.publishedAt} IS NOT NULL`,
        lt(outboxEvents.publishedAt, new Date(Date.now() - olderThanDays * 86400_000)),
      ),
    );
}
