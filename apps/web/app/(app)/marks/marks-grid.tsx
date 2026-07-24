'use client';

import { useState } from 'react';
import { Alert, Card, EmptyState } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Exam {
  id: string;
  name: string;
  classId: string | null;
  status: string;
  startDate: string | null;
}
interface DatesheetEntry {
  id: string; // examSubjectId
  subjectId: string;
  examDate: string | null;
  maxMarks: number;
}
interface GridRow {
  studentId: string;
  name: string;
  rollNumber: string | null;
  marksObtained: number | null;
  isAbsent: boolean;
  isExempt: boolean;
  grade: string | null;
  status: string | null;
}
interface Grid {
  maxMarks: number;
  passMarks: number | null;
  rows: GridRow[];
}

const selectClass =
  'h-10 rounded-lg border border-border bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';

export function MarksGrid({
  exams,
  subjectNames,
}: {
  exams: Exam[];
  subjectNames: Record<string, string>;
}) {
  const [examId, setExamId] = useState('');
  const [datesheet, setDatesheet] = useState<DatesheetEntry[]>([]);
  const [examSubjectId, setExamSubjectId] = useState('');
  const [grid, setGrid] = useState<Grid | null>(null);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onPickExam(id: string) {
    setExamId(id);
    setExamSubjectId('');
    setDatesheet([]);
    setGrid(null);
    setRows([]);
    setError(null);
    setNotice(null);
    if (!id) return;
    try {
      const res = await fetch(`/api/v1/exams/${id}`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Could not load exam.');
        return;
      }
      setDatesheet((body.data.datesheet ?? []) as DatesheetEntry[]);
    } catch {
      setError('Network error.');
    }
  }

  async function onPickSubject(id: string) {
    setExamSubjectId(id);
    setGrid(null);
    setRows([]);
    setError(null);
    setNotice(null);
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/exam-subjects/${id}/marks`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Could not load grid.');
        return;
      }
      setGrid(body.data as Grid);
      setRows((body.data as Grid).rows.map((r) => ({ ...r })));
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  function setMark(studentId: string, value: string) {
    const n = value === '' ? null : Number(value);
    setRows((prev) =>
      prev.map((r) =>
        r.studentId === studentId ? { ...r, marksObtained: n, isAbsent: false } : r,
      ),
    );
  }
  function toggleAbsent(studentId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.studentId === studentId
          ? { ...r, isAbsent: !r.isAbsent, marksObtained: r.isAbsent ? r.marksObtained : null }
          : r,
      ),
    );
  }

  async function onSave() {
    if (!grid || !examSubjectId) return;
    setError(null);
    setNotice(null);
    // Only send rows that carry data (a mark, or an absent flag).
    const entries = rows
      .filter((r) => r.isAbsent || r.marksObtained != null)
      .map((r) => ({
        studentId: r.studentId,
        ...(r.isAbsent ? { isAbsent: true } : { marksObtained: r.marksObtained as number }),
      }));
    if (entries.length === 0) {
      setError('Nothing to save — enter at least one mark.');
      return;
    }
    const overMax = rows.some((r) => r.marksObtained != null && r.marksObtained > grid.maxMarks);
    if (overMax) {
      setError(`Marks cannot exceed the maximum (${grid.maxMarks}).`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/exam-subjects/${examSubjectId}/marks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Save failed (you may not teach this subject).');
        return;
      }
      setNotice(`Saved ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`);
      await onPickSubject(examSubjectId); // reload to show computed grades
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  if (exams.length === 0) {
    return (
      <EmptyState
        title="No exams yet"
        description="Create an exam and its datesheet before entering marks."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {notice && <Alert variant="info">{notice}</Alert>}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label htmlFor="exam" className="mb-1.5 block text-sm font-medium">
              Exam
            </label>
            <select
              id="exam"
              className={`${selectClass} w-full`}
              value={examId}
              onChange={(e) => onPickExam(e.target.value)}
            >
              <option value="">Select an exam…</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                  {ex.startDate ? ` (${ex.startDate})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-56 flex-1">
            <label htmlFor="subject" className="mb-1.5 block text-sm font-medium">
              Subject
            </label>
            <select
              id="subject"
              className={`${selectClass} w-full`}
              value={examSubjectId}
              onChange={(e) => onPickSubject(e.target.value)}
              disabled={!examId || datesheet.length === 0}
            >
              <option value="">
                {examId && datesheet.length === 0 ? 'No datesheet subjects' : 'Select a subject…'}
              </option>
              {datesheet.map((d) => (
                <option key={d.id} value={d.id}>
                  {subjectNames[d.subjectId] ?? 'Subject'} · max {d.maxMarks}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading grid…</p>}

      {grid && (
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-semibold">
              Marks grid{' '}
              <span className="font-normal text-muted-foreground">
                (max {grid.maxMarks}
                {grid.passMarks != null ? `, pass ${grid.passMarks}` : ''})
              </span>
            </h2>
            <Button onClick={onSave} loading={saving}>
              Save marks
            </Button>
          </div>
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No students"
                description="This exam's class has no active students."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Roll</th>
                    <th className="px-4 py-2 font-medium">Student</th>
                    <th className="px-4 py-2 font-medium">Marks</th>
                    <th className="px-4 py-2 font-medium">Absent</th>
                    <th className="px-4 py-2 font-medium">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.studentId} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-muted-foreground">{r.rollNumber ?? '—'}</td>
                      <td className="px-4 py-2 font-medium">{r.name}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          max={grid.maxMarks}
                          value={r.isAbsent ? '' : (r.marksObtained ?? '')}
                          disabled={r.isAbsent || r.isExempt}
                          onChange={(e) => setMark(r.studentId, e.target.value)}
                          className="h-9 w-24 rounded-lg border border-border bg-card px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={r.isAbsent}
                          disabled={r.isExempt}
                          onChange={() => toggleAbsent(r.studentId)}
                          className="size-4"
                          aria-label={`Mark ${r.name} absent`}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-muted-foreground">{r.grade ?? '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
