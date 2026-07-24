/**
 * P2-MOD-07: fee-receipt HTML template. Rendered to PDF by lib/pdf.ts. All
 * interpolated values are HTML-escaped. Amounts arrive as minor-unit integers
 * and are formatted with formatMinor.
 */
import { formatMinor } from '@schoolmate/shared';

export interface ReceiptData {
  schoolName: string;
  receiptNumber: string;
  paidAt: Date;
  method: string;
  reference: string | null;
  studentName: string;
  admissionNumber: string;
  className: string | null;
  /** Minor units. */
  amount: number;
  /** Currency symbol prefix, e.g. ₹. */
  currency: string;
  lines: Array<{ head: string; period: string; amount: number }>;
  /** True when this is not the first time the receipt was generated. */
  reprint: boolean;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  cheque: 'Cheque',
  upi: 'UPI',
  card: 'Card',
  net_banking: 'Net Banking',
  bank_transfer: 'Bank Transfer',
  online: 'Online',
};

export function renderReceiptHtml(d: ReceiptData): string {
  const money = (minor: number) => `${d.currency}${formatMinor(minor)}`;
  const date = d.paidAt.toISOString().slice(0, 10);
  const rows = d.lines.length
    ? d.lines
        .map(
          (l) => `<tr>
            <td>${esc(l.head)}</td>
            <td>${esc(l.period)}</td>
            <td class="num">${money(l.amount)}</td>
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="2">Advance / on account</td><td class="num">${money(d.amount)}</td></tr>`;

  return `<!doctype html>
<html>
<head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1d23; margin: 0; }
  .card { border: 1px solid #cbd2dd; border-radius: 8px; padding: 24px; position: relative; }
  .reprint { position: absolute; top: 18px; right: 20px; font-size: 11px; font-weight: bold;
    color: #b02a37; border: 1px solid #b02a37; border-radius: 4px; padding: 2px 8px; }
  .head { text-align: center; border-bottom: 2px solid #3b5bdb; padding-bottom: 12px; margin-bottom: 16px; }
  .school { font-size: 20px; font-weight: bold; color: #3b5bdb; }
  .title { font-size: 13px; letter-spacing: 2px; color: #555; margin-top: 4px; text-transform: uppercase; }
  .meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
  .meta .row { line-height: 1.7; }
  .label { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 14px; }
  th, td { border: 1px solid #e2e6ec; padding: 8px 10px; text-align: left; }
  th { background: #f2f4f8; }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: bold; background: #f8fafc; }
  .foot { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #666; }
  .note { margin-top: 10px; font-size: 11px; color: #9aa1ad; }
</style>
</head>
<body>
  <div class="card">
    ${d.reprint ? '<div class="reprint">REPRINT</div>' : ''}
    <div class="head">
      <div class="school">${esc(d.schoolName)}</div>
      <div class="title">Fee Receipt</div>
    </div>
    <div class="meta">
      <div class="row">
        <div><span class="label">Student:</span> <b>${esc(d.studentName)}</b></div>
        <div><span class="label">Adm. No:</span> ${esc(d.admissionNumber)}</div>
        ${d.className ? `<div><span class="label">Class:</span> ${esc(d.className)}</div>` : ''}
      </div>
      <div class="row" style="text-align:right">
        <div><span class="label">Receipt No:</span> <b>${esc(d.receiptNumber)}</b></div>
        <div><span class="label">Date:</span> ${esc(date)}</div>
        <div><span class="label">Mode:</span> ${esc(METHOD_LABELS[d.method] ?? d.method)}${
          d.reference ? ` (${esc(d.reference)})` : ''
        }</div>
      </div>
    </div>
    <table>
      <thead>
        <tr><th>Fee Head</th><th>Period</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="2">Total Paid</td><td class="num">${money(d.amount)}</td></tr>
      </tfoot>
    </table>
    <div class="foot">
      <div>Received with thanks.</div>
      <div>Authorised Signatory</div>
    </div>
    <div class="note">This is a computer-generated receipt.</div>
  </div>
</body>
</html>`;
}
