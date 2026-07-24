import Link from 'next/link';
import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { apiFetch, getSession } from '@/lib/api';

interface Summary {
  counts: { students: number; staff: number; openAdmissions: number };
  attendanceToday: { date: string; present: number; absent: number; late: number; marked: number };
  me: {
    staffId: string;
    myClasses: Array<{ sectionId: string; sectionName: string; className: string }>;
    subjectsTaught: number;
  } | null;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

export default async function DashboardPage() {
  const [session, { body }] = await Promise.all([
    getSession(),
    apiFetch<Summary>('/v1/dashboard/summary'),
  ]);
  const summary = body.success ? body.data : null;
  const roleLabel = session?.role.replace(/_/g, ' ') ?? 'user';

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" description={`Welcome back — signed in as ${roleLabel}.`} />

      {/* Admin overview (P1-WEB-01): tenant-wide counts + today's attendance. */}
      <section aria-label="Overview">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Students" value={summary?.counts.students ?? 0} />
          <Stat label="Staff" value={summary?.counts.staff ?? 0} />
          <Stat label="Open admissions" value={summary?.counts.openAdmissions ?? 0} />
          <Card>
            <p className="text-sm text-muted-foreground">Attendance today</p>
            {summary && summary.attendanceToday.marked > 0 ? (
              <p className="mt-1 text-sm">
                <span className="text-lg font-semibold tabular-nums">
                  {summary.attendanceToday.present + summary.attendanceToday.late}
                </span>{' '}
                present ·{' '}
                <span className="font-medium tabular-nums">{summary.attendanceToday.absent}</span>{' '}
                absent
                <span className="mt-1 block text-xs text-muted-foreground">
                  {summary.attendanceToday.marked} marked
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Not marked yet today</p>
            )}
          </Card>
        </div>
      </section>

      {/* Teacher view (P1-WEB-02): my classes, mark-attendance shortcut, timetable placeholder. */}
      {summary?.me && (
        <section aria-label="My teaching" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">My classes</h2>
            <Link
              href="/attendance"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
            >
              Mark attendance
            </Link>
          </div>

          {summary.me.myClasses.length === 0 ? (
            <EmptyState
              title="No classes assigned"
              description="You are not set as a class teacher for any section yet."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {summary.me.myClasses.map((c) => (
                <Link key={c.sectionId} href={`/attendance?section=${c.sectionId}`}>
                  <Card className="transition-colors hover:border-brand">
                    <p className="font-medium">
                      {c.className} · {c.sectionName}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">Tap to mark attendance</p>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-sm text-muted-foreground">Subjects taught</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {summary.me.subjectsTaught}
              </p>
            </Card>
            <Card className="flex items-center">
              <div>
                <p className="text-sm text-muted-foreground">My timetable</p>
                <p className="mt-1 text-sm">Coming soon (Phase 3).</p>
              </div>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}
