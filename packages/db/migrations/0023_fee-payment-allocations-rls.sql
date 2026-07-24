-- RLS for fee_payment_allocations (P2-MOD-09). Same pattern as 0005.
ALTER TABLE fee_payment_allocations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE fee_payment_allocations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON fee_payment_allocations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
