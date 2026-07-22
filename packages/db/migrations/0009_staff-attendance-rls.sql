-- RLS for staff + attendance tables (P1-MOD-18/22). FORCE + NULLIF default-deny.

-- ── departments ─────────────────────────────────────────────
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE departments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON departments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── staff_members ───────────────────────────────────────────
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON staff_members
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── staff_attendance ────────────────────────────────────────
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_attendance FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON staff_attendance
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── attendance_settings ─────────────────────────────────────
ALTER TABLE attendance_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attendance_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON attendance_settings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── student_attendance ──────────────────────────────────────
ALTER TABLE student_attendance ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_attendance FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON student_attendance
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
