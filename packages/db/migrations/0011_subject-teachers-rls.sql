-- RLS for subject_teachers (P1-MOD-07). Same pattern as 0003:
-- ENABLE + FORCE row level security, tenant_isolation via NULLIF-guarded GUC.
-- schoolmate_app already has table privileges via ALTER DEFAULT PRIVILEGES (0001).

-- ── subject_teachers ────────────────────────────────────────
ALTER TABLE subject_teachers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subject_teachers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON subject_teachers
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
