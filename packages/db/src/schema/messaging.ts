import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { notificationChannelEnum, notificationStatusEnum } from './enums.js';
import { tenants } from './tenants.js';
import { users } from './users.js';

/**
 * Transactional outbox (Plan §17). Modules write an event row in the SAME
 * transaction as their state change, so no event is ever lost or phantom.
 * The worker relay polls unpublished rows and dispatches them.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id'),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  // Partial index makes the relay poll (WHERE published_at IS NULL) cheap.
  (t) => [
    index('outbox_unpublished_idx')
      .on(t.createdAt)
      .where(sql`published_at IS NULL`),
  ],
);

/** In-app notifications (the bell). Tenant-scoped (RLS). */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    data: jsonb('data'),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_unread_idx').on(t.tenantId, t.userId, t.isRead)],
);

/** Outbound channel deliveries (email/sms/push/whatsapp). Tenant-scoped (RLS). */
export const notificationQueue = pgTable(
  'notification_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    channel: notificationChannelEnum('channel').notNull(),
    /** email address / phone number for external channels. */
    recipient: text('recipient'),
    eventType: text('event_type').notNull(),
    subject: text('subject'),
    body: text('body').notNull(),
    status: notificationStatusEnum('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notification_queue_status_idx').on(t.status, t.createdAt)],
);

/** Per-user channel/event opt-outs (Plan §4.O). Tenant-scoped (RLS). */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum('channel').notNull(),
    eventType: text('event_type').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notification_pref_unique').on(t.tenantId, t.userId, t.channel, t.eventType)],
);
