'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Card, EmptyState } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Named {
  id: string;
  name: string;
  branchId?: string;
}
interface Structure {
  id: string;
  name: string;
  branchId: string;
  academicSessionId: string;
  classId: string | null;
}
interface Item {
  head: string;
  amount: string; // rupees, as entered
  frequency: string;
}

const FREQUENCIES = ['one_time', 'monthly', 'quarterly', 'half_yearly', 'annual'];
const selectClass =
  'h-10 rounded-lg border border-border bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';
const blankItem = (): Item => ({ head: '', amount: '', frequency: 'monthly' });

export function FeeStructures({
  branches,
  sessions,
  classes,
  initialStructures,
}: {
  branches: Named[];
  sessions: Named[];
  classes: Named[];
  initialStructures: Structure[];
}) {
  const [structures, setStructures] = useState<Structure[]>(initialStructures);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('');
  const [name, setName] = useState('');
  const [items, setItems] = useState<Item[]>([blankItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [allocating, setAllocating] = useState<string | null>(null);

  const inBranch = <T extends Named>(rows: T[]) =>
    rows.filter((r) => !branchId || r.branchId === branchId);
  const byId = (rows: Named[], id: string | null) => rows.find((r) => r.id === id)?.name ?? '—';

  function setItem(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!branchId || !sessionId || !name.trim()) {
      setError('Branch, session and a name are required.');
      return;
    }
    const cleanItems = items
      .filter((it) => it.head.trim() && it.amount !== '')
      .map((it) => ({
        head: it.head.trim(),
        amount: Math.round(Number(it.amount) * 100),
        frequency: it.frequency,
      }));
    if (cleanItems.length === 0) {
      setError('Add at least one line item.');
      return;
    }
    if (cleanItems.some((it) => !Number.isFinite(it.amount) || it.amount < 0)) {
      setError('Amounts must be valid numbers.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/fee-structures', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branchId,
          academicSessionId: sessionId,
          ...(classId ? { classId } : {}),
          name: name.trim(),
          items: cleanItems,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Could not create structure.');
        return;
      }
      setStructures((prev) => [...prev, body.data]);
      setNotice(`Created “${body.data.name}”.`);
      setName('');
      setItems([blankItem()]);
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  async function onAllocate(id: string) {
    setError(null);
    setNotice(null);
    setAllocating(id);
    try {
      const res = await fetch(`/api/v1/fee-structures/${id}/allocate`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Allocation failed.');
        return;
      }
      setNotice(
        `Allocated: ${body.data.duesCreated} due(s) created for ${body.data.students} student(s).`,
      );
    } catch {
      setError('Network error.');
    } finally {
      setAllocating(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="mb-4 font-semibold">New structure</h2>
        {error && (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        )}
        {notice && (
          <div className="mb-3">
            <Alert variant="info">{notice}</Alert>
          </div>
        )}
        <form onSubmit={onCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="branch" className="mb-1.5 block text-sm font-medium">
                Branch
              </label>
              <select
                id="branch"
                className={`${selectClass} w-full`}
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setSessionId('');
                  setClassId('');
                }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="session" className="mb-1.5 block text-sm font-medium">
                Session
              </label>
              <select
                id="session"
                className={`${selectClass} w-full`}
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              >
                <option value="">Select…</option>
                {inBranch(sessions).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="class" className="mb-1.5 block text-sm font-medium">
                Class (optional)
              </label>
              <select
                id="class"
                className={`${selectClass} w-full`}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All / none</option>
                {inBranch(classes).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Grade 5 · 2026-27"
              />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">Line items</p>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    aria-label="Head"
                    value={it.head}
                    onChange={(e) => setItem(i, { head: e.target.value })}
                    placeholder="Tuition"
                    className="flex-1"
                  />
                  <Input
                    aria-label="Amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={it.amount}
                    onChange={(e) => setItem(i, { amount: e.target.value })}
                    placeholder="₹"
                    className="w-28"
                  />
                  <select
                    aria-label="Frequency"
                    className={selectClass}
                    value={it.frequency}
                    onChange={(e) => setItem(i, { frequency: e.target.value })}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {f.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove item"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-2"
              onClick={() => setItems((prev) => [...prev, blankItem()])}
            >
              + Add item
            </Button>
          </div>

          <Button type="submit" loading={saving} className="w-full">
            Create structure
          </Button>
        </form>
      </Card>

      <Card className="p-0">
        <h2 className="border-b border-border px-4 py-3 font-semibold">Existing structures</h2>
        {structures.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No structures yet"
              description="Create one to start charging fees."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Class</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {structures.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{byId(classes, s.classId)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="secondary"
                        loading={allocating === s.id}
                        onClick={() => onAllocate(s.id)}
                      >
                        Allocate
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
