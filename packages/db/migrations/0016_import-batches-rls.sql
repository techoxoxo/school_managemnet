-- RLS for import_batches (P1-MOD-16). Same pattern as 0005:
-- ENABLE + FORCE row level security, tenant_isolation via NULLIF-guarded GUC.
-- schoolmate_app already has table privileges via ALTER DEFAULT PRIVILEGES (0001).

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE import_batches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON import_batches
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
