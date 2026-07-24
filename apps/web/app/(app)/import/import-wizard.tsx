'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Alert, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Branch {
  id: string;
  name: string;
}
interface Batch {
  id: string;
  entityType: string;
  tag: string | null;
  rowCount: number;
  createdAt: string;
}
type Entity = 'students' | 'staff';

const FIELDS: Record<Entity, Array<{ field: string; label: string; required?: boolean }>> = {
  students: [
    { field: 'admissionNumber', label: 'Admission Number', required: true },
    { field: 'firstName', label: 'First Name', required: true },
    { field: 'lastName', label: 'Last Name' },
    { field: 'rollNumber', label: 'Roll Number' },
    { field: 'dateOfBirth', label: 'Date of Birth' },
    { field: 'gender', label: 'Gender' },
    { field: 'admissionDate', label: 'Admission Date' },
    { field: 'parentFirstName', label: 'Parent First Name' },
    { field: 'parentPhone', label: 'Parent Phone' },
    { field: 'parentEmail', label: 'Parent Email' },
    { field: 'parentRelation', label: 'Parent Relation' },
  ],
  staff: [
    { field: 'employeeId', label: 'Employee ID', required: true },
    { field: 'firstName', label: 'First Name', required: true },
    { field: 'lastName', label: 'Last Name' },
    { field: 'designation', label: 'Designation' },
    { field: 'employmentType', label: 'Employment Type' },
    { field: 'qualification', label: 'Qualification' },
    { field: 'dateOfJoining', label: 'Date of Joining' },
  ],
};

const selectClass =
  'h-9 w-full rounded-lg border border-border bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Minimal CSV parser (handles quoted fields + escaped quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

interface DryRun {
  total: number;
  valid: number;
  invalid: number;
  errors: Array<{ row: number; message: string }>;
}

export function ImportWizard({ branches, batches }: { branches: Branch[]; batches: Batch[] }) {
  const router = useRouter();
  const [entity, setEntity] = useState<Entity>('students');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [dry, setDry] = useState<DryRun | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fields = FIELDS[entity];

  function parse() {
    setError(null);
    setMsg(null);
    setDry(null);
    const parsed = parseCsv(csv);
    if (parsed.length < 2) {
      setError('Paste a header row plus at least one data row.');
      return;
    }
    const hdrs = parsed[0]!.map((h) => h.trim());
    setHeaders(hdrs);
    setDataRows(parsed.slice(1));
    // Auto-map each field to a header whose name matches the field or label.
    const auto: Record<string, number> = {};
    for (const f of fields) {
      const idx = hdrs.findIndex((h) => norm(h) === norm(f.field) || norm(h) === norm(f.label));
      if (idx >= 0) auto[f.field] = idx;
    }
    setMapping(auto);
  }

  const rows = useMemo(() => {
    return dataRows.map((r) => {
      const obj: Record<string, string> = {};
      for (const f of fields) {
        const idx = mapping[f.field];
        if (idx != null && idx >= 0) {
          const v = (r[idx] ?? '').trim();
          if (v) obj[f.field] = v;
        }
      }
      return obj;
    });
  }, [dataRows, mapping, fields]);

  async function send(dryRun: boolean) {
    setError(null);
    setMsg(null);
    if (!branchId) return setError('Select a branch.');
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/imports/${entity}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ branchId, dryRun, rows }),
      });
      const body = await res.json();
      if (dryRun) {
        if (!body.success) return setError(body?.error?.message ?? 'Validation failed.');
        setDry(body.data);
        return;
      }
      if (res.status === 422) {
        setDry({
          total: body.data.total,
          valid: body.data.valid,
          invalid: body.data.errors.length,
          errors: body.data.errors,
        });
        setError('Some rows are invalid — fix them before importing.');
        return;
      }
      if (!res.ok || !body.success) return setError(body?.error?.message ?? 'Import failed.');
      setMsg(
        `Imported ${body.data.created} ${entity}${body.data.parentsCreated ? ` and ${body.data.parentsCreated} parents` : ''}.`,
      );
      setCsv('');
      setHeaders([]);
      setDataRows([]);
      setDry(null);
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  }

  async function rollback(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/v1/imports/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const switchEntity = (e: Entity) => {
    setEntity(e);
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setDry(null);
    setMsg(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {msg && <Alert variant="info">{msg}</Alert>}

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium">What</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-border">
              {(['students', 'staff'] as Entity[]).map((e) => (
                <button
                  key={e}
                  onClick={() => switchEntity(e)}
                  className={`px-4 py-2 text-sm capitalize ${entity === e ? 'bg-brand text-brand-foreground' : 'hover:bg-muted'}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-48">
            <span className="mb-1.5 block text-sm font-medium">Branch</span>
            <select
              className={selectClass}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium">
            Paste CSV (first row = column headers)
          </span>
          <textarea
            className="h-32 w-full rounded-lg border border-border bg-card p-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={
              entity === 'students'
                ? 'Admission Number,First Name,Parent Phone\nA-101,Bart,555-0100'
                : 'Employee ID,First Name,Designation\nE-1,Edna,Teacher'
            }
          />
          <div className="mt-2">
            <Button variant="secondary" size="sm" onClick={parse} disabled={!csv.trim()}>
              Parse &amp; map
            </Button>
          </div>
        </div>

        {headers.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              Column mapping — {dataRows.length} row{dataRows.length === 1 ? '' : 's'} detected
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fields.map((f) => (
                <div key={f.field}>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </label>
                  <select
                    className={selectClass}
                    value={mapping[f.field] ?? -1}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [f.field]: Number(e.target.value) }))
                    }
                  >
                    <option value={-1}>— ignore —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => send(true)} loading={busy}>
                Validate (dry-run)
              </Button>
              <Button
                onClick={() => send(false)}
                loading={busy}
                disabled={Boolean(dry && dry.invalid > 0)}
              >
                Import {dataRows.length} row{dataRows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        )}

        {dry && (
          <div className="space-y-2">
            <p className="text-sm">
              <span className="font-semibold text-foreground">{dry.valid}</span> valid ·{' '}
              <span className={dry.invalid ? 'font-semibold text-destructive' : ''}>
                {dry.invalid} invalid
              </span>{' '}
              of {dry.total}
            </p>
            {dry.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border text-sm">
                {dry.errors.map((e, i) => (
                  <div key={i} className="border-b border-border px-3 py-1.5 last:border-0">
                    <span className="text-muted-foreground">Row {e.row}:</span> {e.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-0">
        <p className="border-b border-border px-4 py-3 text-sm font-semibold">Recent imports</p>
        {batches.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Tag</th>
                <th className="px-4 py-2 font-medium">Rows</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 capitalize">{b.entityType}</td>
                  <td className="px-4 py-2 text-muted-foreground">{b.tag ?? '—'}</td>
                  <td className="px-4 py-2 tabular-nums">{b.rowCount}</td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => rollback(b.id)}
                      disabled={busy}
                    >
                      Roll back
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
