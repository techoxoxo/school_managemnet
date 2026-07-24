'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function OnboardButton({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onboard() {
    setError(null);
    setLoading(true);
    try {
      const year = new Date().getFullYear();
      const res = await fetch(`/api/tenants/${tenantId}/onboard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session: {
            name: `${year}-${year + 1}`,
            startDate: `${year}-06-01`,
            endDate: `${year + 1}-05-31`,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Onboarding failed.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && <div className="alert">{error}</div>}
      <button className="btn" onClick={onboard} disabled={loading}>
        {loading ? 'Scaffolding…' : 'Auto-scaffold & onboard'}
      </button>
    </div>
  );
}
