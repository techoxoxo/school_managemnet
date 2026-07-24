import { PageHeader } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { ImportWizard } from './import-wizard';

interface Branch {
  id: string;
  name: string;
}
interface Batch {
  id: string;
  entityType: string;
  tag: string | null;
  rowCount: number;
  createdAt: string;
}

export default async function ImportPage() {
  const [branchRes, batchRes] = await Promise.all([
    apiFetch<Branch[]>('/v1/branches?limit=100'),
    apiFetch<Batch[]>('/v1/imports'),
  ]);
  const branches = branchRes.body.success ? branchRes.body.data : [];
  const batches = batchRes.body.success ? batchRes.body.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk import"
        description="Paste rows from a spreadsheet, map the columns, dry-run, then commit. Every import can be rolled back."
      />
      <ImportWizard branches={branches} batches={batches} />
    </div>
  );
}
