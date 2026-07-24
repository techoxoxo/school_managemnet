import { PageHeader } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { MarksGrid } from './marks-grid';

interface Exam {
  id: string;
  name: string;
  classId: string | null;
  status: string;
  startDate: string | null;
}
interface Subject {
  id: string;
  name: string;
}

/**
 * P2-MOD-15: marks-entry grid. Pick an exam → subject → enter marks in a
 * spreadsheet-style grid (absent/exempt flags). Teacher access is enforced
 * server-side via ABAC (subject_teachers); non-teaching subjects 403 on save.
 */
export default async function MarksPage() {
  const [examsRes, subjectsRes] = await Promise.all([
    apiFetch<Exam[]>('/v1/exams'),
    apiFetch<Subject[]>('/v1/subjects'),
  ]);
  const exams = examsRes.body.success ? examsRes.body.data : [];
  const subjects = subjectsRes.body.success ? subjectsRes.body.data : [];
  const subjectNames = Object.fromEntries(subjects.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marks Entry"
        description="Enter and update marks for an exam subject. Auto-grades on save."
      />
      <MarksGrid exams={exams} subjectNames={subjectNames} />
    </div>
  );
}
