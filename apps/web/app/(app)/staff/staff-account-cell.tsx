'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ROLES = [
  'teacher',
  'branch_admin',
  'accountant',
  'librarian',
  'hostel_warden',
  'transport_manager',
  'receptionist',
  'counselor',
];
const selectClass =
  'h-9 rounded-lg border border-border bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';

export function StaffAccountCell({
  staffId,
  hasAccount,
}: {
  staffId: string;
  hasAccount: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('teacher');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (hasAccount) {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Active</span>;
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Create login
      </Button>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/staff/${staffId}/account`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Failed to create account.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <Input
        type="email"
        placeholder="email@school.test"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-9 w-52"
        required
      />
      <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" loading={loading}>
        Invite
      </Button>
      {error && <span className="w-full text-xs text-destructive">{error}</span>}
    </form>
  );
}
