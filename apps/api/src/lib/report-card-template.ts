/**
 * P2-MOD-18/19: report-card HTML template (generic format). Rendered to PDF by
 * lib/pdf.ts. All interpolated values are HTML-escaped.
 */
export interface ReportCardData {
  schoolName: string;
  examName: string;
  studentName: string;
  admissionNumber: string;
  className: string | null;
  subjects: Array<{
    subject: string;
    marks: number | null;
    maxMarks: number;
    grade: string | null;
    status: string;
  }>;
  totalMarks: number | null;
  maxMarks: number | null;
  percentage: number | null;
  grade: string | null;
  rank: number | null;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function renderReportCardHtml(d: ReportCardData): string {
  const rows = d.subjects
    .map(
      (s) => `<tr>
        <td>${esc(s.subject)}</td>
        <td class="num">${s.status === 'absent' ? 'AB' : esc(s.marks ?? '—')}</td>
        <td class="num">${esc(s.maxMarks)}</td>
        <td class="num">${esc(s.grade ?? '—')}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1d23; margin: 0; }
  .card { border: 2px solid #3b5bdb; border-radius: 10px; padding: 24px; }
  .head { text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 12px; margin-bottom: 16px; }
  .school { font-size: 22px; font-weight: bold; color: #3b5bdb; }
  .exam { font-size: 14px; color: #555; margin-top: 4px; }
  .meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 7px 10px; text-align: left; }
  th { background: #f2f4f8; }
  td.num, th.num { text-align: center; }
  .summary { margin-top: 18px; display: flex; justify-content: space-between; font-size: 14px; }
  .summary b { color: #3b5bdb; }
  .foot { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #666; }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="school">${esc(d.schoolName)}</div>
      <div class="exam">${esc(d.examName)} — Report Card</div>
    </div>
    <div class="meta">
      <div><b>${esc(d.studentName)}</b>${d.className ? ` · ${esc(d.className)}` : ''}</div>
      <div>Adm. No: ${esc(d.admissionNumber)}</div>
    </div>
    <table>
      <thead>
        <tr><th>Subject</th><th class="num">Marks</th><th class="num">Max</th><th class="num">Grade</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="summary">
      <div>Total: <b>${esc(d.totalMarks ?? '—')}</b> / ${esc(d.maxMarks ?? '—')}</div>
      <div>Percentage: <b>${d.percentage == null ? '—' : `${esc(d.percentage)}%`}</b></div>
      <div>Grade: <b>${esc(d.grade ?? '—')}</b></div>
      <div>Rank: <b>${esc(d.rank ?? '—')}</b></div>
    </div>
    <div class="foot">
      <div>Class Teacher</div><div>Principal</div>
    </div>
  </div>
</body>
</html>`;
}
