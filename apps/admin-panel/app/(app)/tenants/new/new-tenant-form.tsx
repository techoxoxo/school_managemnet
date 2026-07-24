'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

const TYPES = [
  { value: 'school', label: 'School' },
  { value: 'playschool', label: 'Playschool' },
  { value: 'kindergarten', label: 'Kindergarten' },
  { value: 'k12_multi_branch', label: 'K-12 (multi-branch)' },
  { value: 'coaching_center', label: 'Coaching center' },
  { value: 'college', label: 'College' },
];

/** Auto-suggest a slug from the name. */
function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function NewTenantForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [instituteType, setInstituteType] = useState('school');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug: effectiveSlug, instituteType }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Could not create the tenant.');
        return;
      }
      router.replace('/tenants');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error && <div className="alert">{error}</div>}
      <label className="field">
        <span className="label">Institute name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Springfield Academy"
          required
        />
      </label>
      <label className="field">
        <span className="label">Slug (subdomain)</span>
        <input
          className="input"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          placeholder="springfield"
          pattern="[a-z0-9-]+"
          required
        />
      </label>
      <label className="field">
        <span className="label">Institute type</span>
        <select
          className="select"
          value={instituteType}
          onChange={(e) => setInstituteType(e.target.value)}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <button className="btn" type="submit" disabled={loading || !name || !effectiveSlug}>
        {loading ? 'Creating…' : 'Create tenant'}
      </button>
    </form>
  );
}
