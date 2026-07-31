import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { FeeStructures } from './fee-structures';

interface Named {
  id: string;
  name: string;
  branchId?: string;
}
interface Structure {
  id: string;
  name: string;
  branchId: string;
  academicSessionId: string;
  classId: string | null;
}

/**
 * P2-MOD-03: fee structure builder. Define a named fee plan with per-head,
 * per-frequency line items, then allocate it to a class → per-student dues.
 */
export default async function FeeStructuresPage() {
  const [branchesRes, sessionsRes, classesRes, structuresRes] = await Promise.all([
    apiFetch<Named[]>('/v1/branches'),
    apiFetch<Named[]>('/v1/academic-sessions'),
    apiFetch<Named[]>('/v1/classes'),
    apiFetch<Structure[]>('/v1/fee-structures'),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Structures"
        description="Build fee plans and allocate them to classes."
      >
        <Link href="/fees">
          <Button variant="secondary">Collection desk</Button>
        </Link>
      </PageHeader>
      <FeeStructures
        branches={branchesRes.body.success ? branchesRes.body.data : []}
        sessions={sessionsRes.body.success ? sessionsRes.body.data : []}
        classes={classesRes.body.success ? classesRes.body.data : []}
        initialStructures={structuresRes.body.success ? structuresRes.body.data : []}
      />
    </div>
  );
}
