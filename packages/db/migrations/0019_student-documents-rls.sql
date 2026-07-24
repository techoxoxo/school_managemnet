-- RLS for student_documents (P1-MOD-10). Same pattern as 0005.
ALTER TABLE student_documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE student_documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON student_documents
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
