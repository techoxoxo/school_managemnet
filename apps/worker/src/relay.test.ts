/**
 * Notification engine (P1-API-01/02) — live Postgres.
 * Proves: transactional-outbox atomicity, relay dispatch → in-app + queued
 * deliveries, queue processor with a fake sender, retry/fail, and preference
 * opt-out suppression.
 */
import {
  createDb,
  createPool,
  emitEvent,
  notificationPreferences,
  notificationQueue,
  notifications,
  outboxEvents,
  tenants,
  users,
  withTenant,
  type Db,
} from '@schoolmate/db';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest';
import type { ChannelSender, SenderRegistry } from './notifications/channels.js';
import { clearHandlers, registerHandler } from './notifications/dispatch.js';
import { drainOutbox, processQueue } from './relay.js';

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://schoolmate:schoolmate_dev@localhost:5433/schoolmate';
const APP_URL =
  process.env.DATABASE_APP_URL ??
  'postgres://schoolmate_app:schoolmate_app_dev@localhost:5433/schoolmate';

const adminPool = createPool(ADMIN_URL);
const appPool = createPool(APP_URL);
const db: Db = createDb(adminPool);

const suffix = Date.now().toString(36);
let tenantId: string;
let userId: string;

// Fake sender that records what it "delivered" and can be told to fail.
class RecordingSender implements ChannelSender {
  sent: string[] = [];
  shouldFail = false;
  async send(msg: { recipient: string; body: string }): Promise<void> {
    if (this.shouldFail) throw new Error('provider down');
    this.sent.push(`${msg.recipient}:${msg.body}`);
  }
}
let sms: RecordingSender;
let senders: SenderRegistry;

beforeAll(async () => {
  const [t] = await db
    .insert(tenants)
    .values({ name: 'Notif Test', slug: `notif-${suffix}`, subscriptionStatus: 'active' })
    .returning();
  tenantId = t!.id;
  const [u] = await db
    .insert(users)
    .values({ email: `notif-${suffix}@test.dev`, status: 'active' })
    .returning();
  userId = u!.id;
});

beforeEach(() => {
  clearHandlers();
  sms = new RecordingSender();
  senders = { sms };
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  await adminPool.end();
  await appPool.end();
});

describe('transactional outbox (P1-API-01)', () => {
  it('emitEvent inside a rolled-back tx leaves NO event', async () => {
    await expect(
      withTenant(appPool, tenantId, async (tdb) => {
        await emitEvent(tdb, {
          tenantId,
          type: 'test.rollback',
          aggregateType: 'test',
          payload: { x: 1 },
        });
        throw new Error('boom'); // force rollback
      }),
    ).rejects.toThrow('boom');

    const rows = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.tenantId, tenantId), eq(outboxEvents.eventType, 'test.rollback')));
    expect(rows).toHaveLength(0);
  });

  it('emitEvent in a committed tx persists exactly one event', async () => {
    await withTenant(appPool, tenantId, (tdb) =>
      emitEvent(tdb, { tenantId, type: 'test.commit', aggregateType: 'test', payload: { x: 2 } }),
    );
    const rows = await db
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.tenantId, tenantId), eq(outboxEvents.eventType, 'test.commit')));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.publishedAt).toBeNull();
  });
});

describe('relay dispatch (P1-API-02)', () => {
  it('drains outbox → creates in-app notification + queued SMS, marks published', async () => {
    registerHandler('test.absent', (event) => {
      const p = event.payload as { phone?: string };
      return [
        {
          userId,
          recipient: p.phone,
          channels: ['in_app', 'sms'],
          title: 'Absent',
          body: 'Student was absent',
        },
      ];
    });

    await withTenant(appPool, tenantId, (tdb) =>
      emitEvent(tdb, {
        tenantId,
        type: 'test.absent',
        aggregateType: 'student',
        payload: { phone: '555-0199' },
      }),
    );

    const published = await drainOutbox(db);
    expect(published).toBeGreaterThanOrEqual(1);

    const inApp = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.eventType, 'test.absent')));
    expect(inApp).toHaveLength(1);
    expect(inApp[0]!.title).toBe('Absent');

    const queued = await db
      .select()
      .from(notificationQueue)
      .where(
        and(
          eq(notificationQueue.tenantId, tenantId),
          eq(notificationQueue.eventType, 'test.absent'),
        ),
      );
    expect(queued).toHaveLength(1);
    expect(queued[0]!.channel).toBe('sms');
    expect(queued[0]!.status).toBe('queued');

    // The event is now published and won't be re-dispatched.
    const again = await drainOutbox(db);
    const stillQueued = await db
      .select()
      .from(notificationQueue)
      .where(
        and(
          eq(notificationQueue.tenantId, tenantId),
          eq(notificationQueue.eventType, 'test.absent'),
        ),
      );
    expect(stillQueued).toHaveLength(1); // no duplicate
    void again;
  });

  it('respects a user opt-out preference', async () => {
    await db.insert(notificationPreferences).values({
      tenantId,
      userId,
      channel: 'sms',
      eventType: 'test.optout',
      isEnabled: false,
    });
    registerHandler('test.optout', () => [
      { userId, recipient: '555-0000', channels: ['sms'], title: 'x', body: 'y' },
    ]);
    await withTenant(appPool, tenantId, (tdb) =>
      emitEvent(tdb, { tenantId, type: 'test.optout', aggregateType: 'test' }),
    );
    await drainOutbox(db);

    const queued = await db
      .select()
      .from(notificationQueue)
      .where(
        and(
          eq(notificationQueue.tenantId, tenantId),
          eq(notificationQueue.eventType, 'test.optout'),
        ),
      );
    expect(queued).toHaveLength(0); // suppressed
  });
});

describe('queue processor (P1-API-02)', () => {
  it('delivers queued SMS via the sender and marks sent', async () => {
    registerHandler('test.deliver', () => [
      { userId, recipient: '555-1234', channels: ['sms'], title: 't', body: 'hello' },
    ]);
    await withTenant(appPool, tenantId, (tdb) =>
      emitEvent(tdb, { tenantId, type: 'test.deliver', aggregateType: 'test' }),
    );
    await drainOutbox(db);

    const delivered = await processQueue(db, senders);
    expect(delivered).toBeGreaterThanOrEqual(1);
    expect(sms.sent).toContain('555-1234:hello');

    const [row] = await db
      .select()
      .from(notificationQueue)
      .where(
        and(
          eq(notificationQueue.tenantId, tenantId),
          eq(notificationQueue.eventType, 'test.deliver'),
        ),
      );
    expect(row!.status).toBe('sent');
    expect(row!.sentAt).not.toBeNull();
  });

  it('retries on failure and stays queued until max attempts', async () => {
    sms.shouldFail = true;
    registerHandler('test.retry', () => [
      { userId, recipient: '555-9999', channels: ['sms'], title: 't', body: 'boom' },
    ]);
    await withTenant(appPool, tenantId, (tdb) =>
      emitEvent(tdb, { tenantId, type: 'test.retry', aggregateType: 'test' }),
    );
    await drainOutbox(db);
    await processQueue(db, senders);

    const [row] = await db
      .select()
      .from(notificationQueue)
      .where(
        and(
          eq(notificationQueue.tenantId, tenantId),
          eq(notificationQueue.eventType, 'test.retry'),
        ),
      );
    expect(row!.attempts).toBe(1);
    expect(row!.status).toBe('queued'); // will retry next pass
    expect(row!.lastError).toContain('provider down');
  });
});
