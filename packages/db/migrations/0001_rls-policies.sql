-- ============================================================
-- RLS foundation (P0-DB-05)
--
-- 1. Application role `schoolmate_app` — NON-superuser. The API and worker
--    MUST connect as this role (DATABASE_APP_URL); superusers bypass RLS.
-- 2. Every tenant-scoped table: ENABLE + FORCE row level security, with a
--    tenant_isolation policy on current_setting('app.tenant_id').
--    `withTenant()` in @schoolmate/db sets that GUC per transaction.
--    NULLIF guards the Postgres quirk where an unset-but-touched custom GUC
--    reads as '' instead of NULL: no/empty GUC → NULL → zero rows (default deny).
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'schoolmate_app') THEN
    CREATE ROLE schoolmate_app LOGIN PASSWORD 'schoolmate_app_dev';
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO schoolmate_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO schoolmate_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO schoolmate_app;
--> statement-breakpoint

-- ── branches ────────────────────────────────────────────────
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON branches
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── academic_sessions ───────────────────────────────────────
ALTER TABLE academic_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE academic_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON academic_sessions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── user_tenant_roles ───────────────────────────────────────
ALTER TABLE user_tenant_roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_tenant_roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON user_tenant_roles
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── custom_roles ────────────────────────────────────────────
ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE custom_roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON custom_roles
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── audit_logs ──────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── login_history ───────────────────────────────────────────
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE login_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON login_history
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
