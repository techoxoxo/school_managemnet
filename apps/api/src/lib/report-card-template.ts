/**
 * P2-MOD-18/19: report-card HTML templates, rendered to PDF by lib/pdf.ts.
 * Two formats are supported and selected per tenant (config.reportCardTemplate):
 *   - 'generic' — clean marks/grade table (default)
 *   - 'cbse'    — CBSE-style scholastic sheet with a result line
 * All interpolated values are HTML-escaped.
 */
export type ReportCardTemplate = 'generic' | 'cbse';

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

const marksCell = (s: ReportCardData['subjects'][number]): string =>
  s.status === 'absent' ? 'AB' : s.status === 'exempt' ? 'EX' : esc(s.marks ?? '—');

/** Pick and render the configured template. */
export function renderReportCardHtml(
  d: ReportCardData,
  template: ReportCardTemplate = 'generic',
): string {
  return template === 'cbse' ? renderCbse(d) : renderGeneric(d);
}

function renderGeneric(d: ReportCardData): string {
  const rows = d.subjects
    .map(
      (s) => `<tr>
        <td>${esc(s.subject)}</td>
        <td class="num">${marksCell(s)}</td>
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

function renderCbse(d: ReportCardData): string {
  // CBSE scholastic sheet: per-subject marks + grade, overall grade + result.
  const rows = d.subjects
    .map(
      (s, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${esc(s.subject)}</td>
        <td class="num">${esc(s.maxMarks)}</td>
        <td class="num">${marksCell(s)}</td>
        <td class="num">${esc(s.grade ?? '—')}</td>
      </tr>`,
    )
    .join('');
  // CBSE "pass" heuristic: an overall grade present and not a failing E/F grade.
  const passed = d.grade != null && !/^[EF]/i.test(d.grade);

  return `<!doctype html>
<html>
<head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Cambria, Georgia, serif; color: #1b1b1b; margin: 0; }
  .card { border: 3px double #7a1f2b; padding: 22px; }
  .head { text-align: center; margin-bottom: 6px; }
  .board { font-size: 11px; letter-spacing: 3px; color: #7a1f2b; text-transform: uppercase; }
  .school { font-size: 22px; font-weight: bold; margin: 2px 0; }
  .title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;
    background: #7a1f2b; color: #fff; display: inline-block; padding: 3px 14px; border-radius: 3px; margin-top: 6px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 13px; margin: 16px 4px; }
  .label { color: #6b6b6b; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #b9a3a6; padding: 6px 9px; }
  th { background: #f6eef0; text-align: center; }
  td.num, th.num { text-align: center; }
  th:nth-child(2), td:nth-child(2) { text-align: left; }
  tfoot td { font-weight: bold; background: #faf5f6; }
  .result { margin-top: 16px; font-size: 15px; }
  .result .badge { font-weight: bold; padding: 2px 12px; border-radius: 4px; color: #fff;
    background: ${passed ? '#2f7d3b' : '#b02a37'}; }
  .sign { margin-top: 44px; display: flex; justify-content: space-between; font-size: 12px; color: #555; }
</style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="board">Central Board of Secondary Education</div>
      <div class="school">${esc(d.schoolName)}</div>
      <div class="title">${esc(d.examName)} — Report Card</div>
    </div>
    <div class="meta">
      <div><span class="label">Student:</span> <b>${esc(d.studentName)}</b></div>
      <div><span class="label">Admission No:</span> ${esc(d.admissionNumber)}</div>
      <div><span class="label">Class:</span> ${esc(d.className ?? '—')}</div>
      <div><span class="label">Rank:</span> ${esc(d.rank ?? '—')}</div>
    </div>
    <table>
      <thead>
        <tr><th class="num">#</th><th>Subject</th><th class="num">Max</th><th class="num">Marks</th><th class="num">Grade</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2">Total</td>
          <td class="num">${esc(d.maxMarks ?? '—')}</td>
          <td class="num">${esc(d.totalMarks ?? '—')}</td>
          <td class="num">${esc(d.grade ?? '—')}</td>
        </tr>
      </tfoot>
    </table>
    <div class="result">
      Percentage: <b>${d.percentage == null ? '—' : `${esc(d.percentage)}%`}</b>
      &nbsp;·&nbsp; Result: <span class="badge">${passed ? 'PASS' : 'NEEDS IMPROVEMENT'}</span>
    </div>
    <div class="sign">
      <div>Class Teacher</div><div>Examination In-charge</div><div>Principal</div>
    </div>
  </div>
</body>
</html>`;
}
