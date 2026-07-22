import { Card, EmptyState, PageHeader } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

interface Branch {
  id: string;
  name: string;
  code: string;
  isMainBranch: boolean;
  isActive: boolean;
}

export default async function BranchesPage() {
  const { body } = await apiFetch<Branch[]>('/v1/branches');
  const branches = body.success ? body.data : [];

  return (
    <div>
      <PageHeader title="Branches" description="Campuses under this school." />

      {branches.length === 0 ? (
        <EmptyState
          title="No branches yet"
          description="Branch management arrives in Phase 1 (P1-MOD-04)."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{b.name}</p>
                  <p className="text-sm text-muted-foreground">{b.code}</p>
                </div>
                {b.isMainBranch && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Main</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
