-- RLS for academic-structure tables (P1-MOD-06/07). Same pattern as 0001:
-- ENABLE + FORCE row level security, tenant_isolation via NULLIF-guarded GUC.
-- schoolmate_app already has table privileges via ALTER DEFAULT PRIVILEGES (0001).

-- ── classes ─────────────────────────────────────────────────
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON classes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── sections ────────────────────────────────────────────────
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON sections
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── subjects ────────────────────────────────────────────────
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subjects FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON subjects
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ── class_subjects ──────────────────────────────────────────
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE class_subjects FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON class_subjects
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
