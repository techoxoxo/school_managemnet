import { Alert, Card, EmptyState, PageHeader } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

interface Summary {
  attendanceToday: { date: string; present: number; absent: number; late: number; marked: number };
  me: {
    myClasses: Array<{ sectionId: string; sectionName: string; className: string }>;
  } | null;
}

export default async function AttendancePage() {
  const { body } = await apiFetch<Summary>('/v1/dashboard/summary');
  const summary = body.success ? body.data : null;
  const classes = summary?.me?.myClasses ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Mark and review daily attendance." />

      {summary && (
        <Card>
          <p className="text-sm text-muted-foreground">Today ({summary.attendanceToday.date})</p>
          <p className="mt-1 text-sm">
            <span className="text-lg font-semibold tabular-nums">
              {summary.attendanceToday.marked}
            </span>{' '}
            marked — {summary.attendanceToday.present + summary.attendanceToday.late} present,{' '}
            {summary.attendanceToday.absent} absent
          </p>
        </Card>
      )}

      {classes.length === 0 ? (
        <EmptyState
          title="No classes to mark"
          description="You are not assigned as a class teacher. Ask an admin to assign your sections."
        />
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Your classes</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c) => (
              <Card key={c.sectionId}>
                <p className="font-medium">
                  {c.className} · {c.sectionName}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Ready to mark</p>
              </Card>
            ))}
          </div>
          <Alert variant="info">
            The keyboard-fast marking grid ships next (P1-MOD-23 UI). The API behind it is already
            live.
          </Alert>
        </div>
      )}
    </div>
  );
}
