-- RLS for messaging tables (P1-API-01/02). FORCE + NULLIF default-deny.
-- The worker relay/dispatcher connects with the admin (BYPASSRLS) role, so it
-- processes every tenant's outbox; the app role stays tenant-scoped for writes.

-- ── outbox_events ───────────────────────────────────────────
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON outbox_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── notifications ───────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notifications
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── notification_queue ──────────────────────────────────────
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_queue FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notification_queue
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── notification_preferences ────────────────────────────────
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notification_preferences
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
