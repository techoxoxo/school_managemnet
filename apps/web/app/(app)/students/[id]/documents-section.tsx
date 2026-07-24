'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Alert, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Doc {
  id: string;
  docType: string;
  fileName: string;
  status: 'pending' | 'verified' | 'rejected';
  remarks: string | null;
}
interface ChecklistItem {
  docType: string;
  required: boolean;
  present: boolean;
  status: string | null;
}
export interface DocList {
  documents: Doc[];
  checklist: ChecklistItem[];
}

const DOC_TYPES = [
  'photo',
  'birth_certificate',
  'aadhaar',
  'transfer_certificate',
  'marksheet',
  'address_proof',
  'other',
];
const selectClass =
  'h-9 rounded-lg border border-border bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';
const label = (t: string) => t.replace(/_/g, ' ');
const badgeClass = (status: string | null) =>
  status === 'verified'
    ? 'bg-green-100 text-green-800'
    : status === 'rejected'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-muted text-muted-foreground';

export function DocumentsSection({ studentId, initial }: { studentId: string; initial: DocList }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('photo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/v1/students/${studentId}/documents`;

  async function upload() {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Choose a file first.');
    setBusy(true);
    try {
      // 1. presigned PUT URL
      const urlRes = await fetch(`${base}/upload-url`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docType, fileName: file.name }),
      });
      const urlBody = await urlRes.json();
      if (!urlRes.ok || !urlBody.success) throw new Error(urlBody?.error?.message ?? 'URL failed');
      const { uploadUrl, storageKey } = urlBody.data;

      // 2. upload bytes straight to object storage
      const put = await fetch(uploadUrl, { method: 'PUT', body: file });
      if (!put.ok) throw new Error('Upload to storage failed');

      // 3. record the document
      const rec = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          docType,
          fileName: file.name,
          storageKey,
          contentType: file.type || undefined,
          sizeBytes: file.size,
        }),
      });
      if (!rec.ok) throw new Error('Recording failed');
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function act(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        ...(body
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error?.message ?? 'Action failed');
      }
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function download(docId: string) {
    const res = await act(`${base}/${docId}/download-url`, 'GET');
    if (!res) return;
    const body = await res.json();
    if (body.success) window.open(body.data.downloadUrl, '_blank');
  }
  async function verify(docId: string, status: 'verified' | 'rejected') {
    if (await act(`${base}/${docId}/verify`, 'POST', { status })) router.refresh();
  }
  async function remove(docId: string) {
    if (await act(`${base}/${docId}`, 'DELETE')) router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <h2 className="text-sm font-semibold">Documents checklist</h2>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          {initial.checklist.map((c) => (
            <span
              key={c.docType}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                c.present
                  ? badgeClass(c.status)
                  : 'border border-dashed border-border text-muted-foreground'
              }`}
            >
              {label(c.docType)}
              {c.present ? ` · ${c.status}` : ' · missing'}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <select
            className={selectClass}
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </select>
          <input ref={fileRef} type="file" className="text-sm" />
          <Button size="sm" onClick={upload} loading={busy}>
            Upload
          </Button>
        </div>
      </Card>

      {initial.documents.length > 0 && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {initial.documents.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 capitalize">{label(d.docType)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.fileName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(d.status)}`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => download(d.id)}
                        disabled={busy}
                      >
                        Download
                      </Button>
                      {d.status !== 'verified' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => verify(d.id, 'verified')}
                          disabled={busy}
                        >
                          Verify
                        </Button>
                      )}
                      {d.status !== 'rejected' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => verify(d.id, 'rejected')}
                          disabled={busy}
                        >
                          Reject
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => remove(d.id)}
                        disabled={busy}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
