import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';
import { AddStaffForm } from './add-staff-form';
import { StaffAccountCell } from './staff-account-cell';

interface Staff {
  id: string;
  firstName: string;
  lastName: string | null;
  employeeId: string;
  designation: string | null;
  userId: string | null;
  status: string;
}
interface Branch {
  id: string;
  name: string;
}

export default async function StaffPage() {
  const [staffRes, branchRes] = await Promise.all([
    apiFetch<Staff[]>('/v1/staff?limit=100'),
    apiFetch<Branch[]>('/v1/branches?limit=100'),
  ]);
  const staff = staffRes.body.success ? staffRes.body.data : [];
  const branches = branchRes.body.success ? branchRes.body.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Staff" description="Employees, their login accounts, and roles." />

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Add staff member</h2>
        <AddStaffForm branches={branches} />
      </Card>

      {staff.length === 0 ? (
        <EmptyState title="No staff yet" description="Add your first employee above." />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Employee ID</th>
                  <th className="px-4 py-3 font-medium">Designation</th>
                  <th className="px-4 py-3 font-medium">Login account</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {[s.firstName, s.lastName].filter(Boolean).join(' ')}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.employeeId}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.designation ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StaffAccountCell staffId={s.id} hasAccount={Boolean(s.userId)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
