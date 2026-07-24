import { PageHeader } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { StudentSearch } from './student-search';

interface Student {
  id: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName: string;
  lastName: string | null;
  status: string;
}

export default async function StudentsPage() {
  const { body } = await apiFetch<Student[]>('/v1/students?limit=50');
  const initial = body.success ? body.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Students" description="Search and browse enrolled students." />
      <StudentSearch initial={initial} />
    </div>
  );
}
