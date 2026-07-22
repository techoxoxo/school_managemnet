-- RLS for people tables (P1-MOD-08). Same FORCE + NULLIF default-deny pattern.

-- ── students ────────────────────────────────────────────────
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE students FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON students
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── parents ─────────────────────────────────────────────────
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE parents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON parents
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── parent_student ──────────────────────────────────────────
ALTER TABLE parent_student ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE parent_student FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON parent_student
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
