import { Card, PageHeader } from '@/components/ui/card';
import { getSession } from '@/lib/api';

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div>
      <PageHeader title="Dashboard" description="Phase 0 foundation — modules arrive in Phase 1." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="mt-1 font-medium capitalize">{session?.role.replace(/_/g, ' ')}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Permissions</p>
          <p className="mt-1 font-medium">
            {session?.permissions.includes('*')
              ? 'Full access'
              : `${session?.permissions.length ?? 0} grants`}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Tenant</p>
          <p className="mt-1 truncate font-mono text-xs">{session?.tenantId}</p>
        </Card>
      </div>
    </div>
  );
}
