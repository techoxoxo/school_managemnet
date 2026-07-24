import Link from 'next/link';
import { apiFetch } from '../../../../lib/api';
import { OnboardButton } from './onboard-button';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  instituteType: string;
  subscriptionStatus: string;
  maxBranches: number;
  maxStudents: number;
  onboardedAt: string | null;
  config: {
    modules?: string[];
    terminology?: Record<string, string>;
    featureFlags?: Record<string, boolean>;
  };
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { body } = await apiFetch<Tenant>(`/platform/tenants/${id}`);
  if (!body.success) {
    return (
      <div className="page">
        <div className="alert">Tenant not found.</div>
        <Link href="/tenants" className="btn btn-ghost">
          Back
        </Link>
      </div>
    );
  }
  const t = body.data;
  const terms = t.config?.terminology ?? {};
  const modules = t.config?.modules ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">{t.name}</h1>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {t.slug} · <span className="badge">{t.instituteType.replace(/_/g, ' ')}</span>{' '}
            <span className="badge">{t.subscriptionStatus}</span>
          </p>
        </div>
        <Link href="/tenants" className="btn btn-ghost">
          Back
        </Link>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Onboarding</h2>
        {t.onboardedAt ? (
          <p className="muted">
            Onboarded — main branch, current session, and the class ladder have been scaffolded.
          </p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Not onboarded yet. Scaffolding creates a main branch, a current academic session, and
              the default classes for a <strong>{t.instituteType.replace(/_/g, ' ')}</strong>.
            </p>
            <OnboardButton tenantId={t.id} />
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Configuration</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Limits: {t.maxBranches} branch{t.maxBranches === 1 ? '' : 'es'} · {t.maxStudents} students
        </p>
        <p style={{ marginBottom: '0.35rem', fontWeight: 500 }}>Enabled modules</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
          {modules.length === 0 ? (
            <span className="muted">None</span>
          ) : (
            modules.map((m) => (
              <span key={m} className="badge">
                {m}
              </span>
            ))
          )}
        </div>
        <p style={{ marginBottom: '0.35rem', fontWeight: 500 }}>Terminology</p>
        <table className="table">
          <tbody>
            {Object.entries(terms).length === 0 ? (
              <tr>
                <td className="muted">Defaults</td>
              </tr>
            ) : (
              Object.entries(terms).map(([k, v]) => (
                <tr key={k}>
                  <td className="muted" style={{ textTransform: 'capitalize' }}>
                    {k}
                  </td>
                  <td>{v}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
