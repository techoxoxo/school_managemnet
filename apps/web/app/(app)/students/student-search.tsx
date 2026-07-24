'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Card, EmptyState } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Student {
  id: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName: string;
  lastName: string | null;
  status: string;
}

const selectClass =
  'h-10 rounded-lg border border-border bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';
const STATUSES = ['active', 'alumni', 'transferred', 'expelled', 'dropout', 'passout'];

export function StudentSearch({ initial }: { initial: Student[] }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<Student[]>(initial);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // No text and no filter → show the default list again.
    if (!q.trim() && !status) {
      setRows(initial);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      // Full-text search needs a query term; status-only browsing uses the
      // list endpoint (which also supports a status filter).
      const term = q.trim();
      let url: string;
      if (term) {
        const p = new URLSearchParams({ q: term });
        if (status) p.set('status', status);
        url = `/api/v1/students/search?${p.toString()}`;
      } else {
        const p = new URLSearchParams({ limit: '50', status });
        url = `/api/v1/students?${p.toString()}`;
      }
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Search failed.');
        return;
      }
      setRows(body.data);
      setSearched(true);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          {error && (
            <div className="w-full">
              <Alert>{error}</Alert>
            </div>
          )}
          <div className="min-w-64 flex-1">
            <label htmlFor="q" className="mb-1.5 block text-sm font-medium">
              Search
            </label>
            <Input
              id="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, admission number, roll number…"
            />
          </div>
          <div>
            <label htmlFor="status" className="mb-1.5 block text-sm font-medium">
              Status
            </label>
            <select
              id="status"
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Any</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={loading}>
            Search
          </Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title={searched ? 'No matches' : 'No students yet'}
          description={
            searched ? 'Try a different name or filter.' : 'Students you admit will appear here.'
          }
        />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Admission #</th>
                  <th className="px-4 py-3 font-medium">Roll</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {[s.firstName, s.lastName].filter(Boolean).join(' ')}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.admissionNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.rollNumber ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                        {s.status}
                      </span>
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
