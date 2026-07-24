import Link from 'next/link';
import { apiFetch } from '../../../lib/api';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  instituteType: string;
  subscriptionStatus: string;
  onboardedAt: string | null;
}

export default async function TenantsPage() {
  const { body } = await apiFetch<Tenant[]>('/platform/tenants?limit=100');
  const tenants = body.success ? body.data : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Tenants</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {tenants.length} institute{tenants.length === 1 ? '' : 's'} on the platform.
          </p>
        </div>
        <Link href="/tenants/new" className="btn">
          + New tenant
        </Link>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Type</th>
              <th>Status</th>
              <th>Onboarded</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '2rem' }}>
                  No tenants yet — create the first one.
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link
                      href={`/tenants/${t.id}`}
                      style={{ color: 'var(--brand)', fontWeight: 500 }}
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="muted">{t.slug}</td>
                  <td>
                    <span className="badge">{t.instituteType.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    <span className="badge">{t.subscriptionStatus}</span>
                  </td>
                  <td className="muted">{t.onboardedAt ? 'Yes' : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
