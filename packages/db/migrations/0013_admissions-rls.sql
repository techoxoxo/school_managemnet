-- RLS for admissions (P1-MOD-12). Same pattern as 0005:
-- ENABLE + FORCE row level security, tenant_isolation via NULLIF-guarded GUC.
-- schoolmate_app already has table privileges via ALTER DEFAULT PRIVILEGES (0001).

ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE admissions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON admissions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
