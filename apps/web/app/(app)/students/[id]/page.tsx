import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { DocumentsSection, type DocList } from './documents-section';

interface Student {
  id: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName: string;
  lastName: string | null;
  status: string;
}

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [sRes, dRes] = await Promise.all([
    apiFetch<Student>(`/v1/students/${id}`),
    apiFetch<DocList>(`/v1/students/${id}/documents`),
  ]);

  if (!sRes.body.success) {
    return (
      <div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Student not found.
        </div>
        <Link href="/students" className="mt-4 inline-block text-sm text-brand">
          ← Back to students
        </Link>
      </div>
    );
  }
  const s = sRes.body.data;
  const docs: DocList = dRes.body.success ? dRes.body.data : { documents: [], checklist: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        title={[s.firstName, s.lastName].filter(Boolean).join(' ')}
        description={`Admission ${s.admissionNumber}`}
      >
        <Link href="/students" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </PageHeader>

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Admission #</p>
            <p className="font-medium">{s.admissionNumber}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Roll</p>
            <p className="font-medium">{s.rollNumber ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="font-medium capitalize">{s.status}</p>
          </div>
        </div>
      </Card>

      <DocumentsSection studentId={s.id} initial={docs} />
    </div>
  );
}
