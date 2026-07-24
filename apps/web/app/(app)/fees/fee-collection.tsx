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
}

interface Due {
  id: string;
  head: string;
  period: string;
  amountDue: number;
  amountPaid: number;
  discountAmount: number;
  status: string;
}
interface Payment {
  id: string;
  amount: number;
  method: string;
  receiptNumber: string;
  status: string;
  paidAt: string;
}
interface Fees {
  dues: Due[];
  payments: Payment[];
  totalOutstanding: number;
}

const selectClass =
  'h-10 rounded-lg border border-border bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';
const METHODS = ['cash', 'cheque', 'upi', 'card', 'net_banking', 'bank_transfer'];

/** Minor units (paise) → ₹ display. */
const inr = (minor: number) =>
  `₹${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dueOutstanding = (d: Due) => Math.max(0, d.amountDue - d.amountPaid - d.discountAmount);

export function FeeCollection() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);
  const [fees, setFees] = useState<Fees | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Collect form.
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ id: string; receiptNumber: string } | null>(
    null,
  );

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/v1/students/search?q=${encodeURIComponent(term)}`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Search failed.');
        return;
      }
      setResults(body.data as Student[]);
    } catch {
      setError('Network error.');
    } finally {
      setSearching(false);
    }
  }

  async function selectStudent(s: Student) {
    setSelected(s);
    setResults([]);
    setQ('');
    setFees(null);
    setLastReceipt(null);
    setError(null);
    await loadFees(s.id);
  }

  async function loadFees(studentId: string) {
    try {
      const res = await fetch(`/api/v1/students/${studentId}/fees`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Could not load fees.');
        return;
      }
      setFees(body.data as Fees);
    } catch {
      setError('Network error.');
    }
  }

  async function onCollect(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setCollecting(true);
    try {
      const res = await fetch(`/api/v1/students/${selected.id}/payments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(rupees * 100),
          method,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body?.error?.message ?? 'Payment failed.');
        return;
      }
      setLastReceipt({
        id: body.data.payment.id,
        receiptNumber: body.data.payment.receiptNumber,
      });
      setAmount('');
      setReference('');
      await loadFees(selected.id);
    } catch {
      setError('Network error.');
    } finally {
      setCollecting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}

      {!selected && (
        <Card>
          <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label htmlFor="fee-q" className="mb-1.5 block text-sm font-medium">
                Find student
              </label>
              <Input
                id="fee-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, admission number, roll number…"
              />
            </div>
            <Button type="submit" loading={searching}>
              Search
            </Button>
          </form>

          {results.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {results.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="px-2 py-3 font-medium">
                        {[s.firstName, s.lastName].filter(Boolean).join(' ')}
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">{s.admissionNumber}</td>
                      <td className="px-2 py-3 text-right">
                        <Button variant="secondary" onClick={() => selectStudent(s)}>
                          Select
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {selected && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {[selected.firstName, selected.lastName].filter(Boolean).join(' ')}
                </p>
                <p className="text-sm text-muted-foreground">
                  Adm. {selected.admissionNumber}
                  {selected.rollNumber ? ` · Roll ${selected.rollNumber}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(null);
                  setFees(null);
                  setLastReceipt(null);
                }}
              >
                Change student
              </Button>
            </div>
          </Card>

          {lastReceipt && (
            <Alert variant="info">
              Payment recorded — receipt <strong>{lastReceipt.receiptNumber}</strong>.{' '}
              <a
                className="text-brand underline"
                href={`/api/v1/payments/${lastReceipt.id}/receipt.pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download receipt PDF
              </a>
            </Alert>
          )}

          {fees && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2 p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h2 className="font-semibold">Outstanding dues</h2>
                  <span className="text-sm">
                    Total due:{' '}
                    <strong className="tabular-nums">{inr(fees.totalOutstanding)}</strong>
                  </span>
                </div>
                {fees.dues.length === 0 ? (
                  <div className="p-4">
                    <EmptyState title="No dues" description="No fees have been allocated yet." />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                          <th className="px-4 py-2 font-medium">Head</th>
                          <th className="px-4 py-2 font-medium">Period</th>
                          <th className="px-4 py-2 text-right font-medium">Due</th>
                          <th className="px-4 py-2 text-right font-medium">Paid</th>
                          <th className="px-4 py-2 text-right font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fees.dues.map((d) => (
                          <tr key={d.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-2 font-medium">{d.head}</td>
                            <td className="px-4 py-2 text-muted-foreground">{d.period}</td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {inr(d.amountDue)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {inr(d.amountPaid)}
                            </td>
                            <td className="px-4 py-2 text-right font-medium tabular-nums">
                              {inr(dueOutstanding(d))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="mb-3 font-semibold">Collect payment</h2>
                <form onSubmit={onCollect} className="space-y-3">
                  <div>
                    <label htmlFor="amt" className="mb-1.5 block text-sm font-medium">
                      Amount (₹)
                    </label>
                    <Input
                      id="amt"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="method" className="mb-1.5 block text-sm font-medium">
                      Method
                    </label>
                    <select
                      id="method"
                      className={`${selectClass} w-full`}
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      {METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ref" className="mb-1.5 block text-sm font-medium">
                      Reference (optional)
                    </label>
                    <Input
                      id="ref"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Cheque / UPI / txn no."
                    />
                  </div>
                  <Button type="submit" loading={collecting} className="w-full">
                    Collect
                  </Button>
                </form>
              </Card>
            </div>
          )}

          {fees && fees.payments.length > 0 && (
            <Card className="p-0">
              <h2 className="border-b border-border px-4 py-3 font-semibold">Payment history</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Receipt</th>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Method</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {fees.payments.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium">{p.receiptNumber}</td>
                        <td className="px-4 py-2 text-muted-foreground">{p.paidAt.slice(0, 10)}</td>
                        <td className="px-4 py-2 capitalize">{p.method.replace('_', ' ')}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{inr(p.amount)}</td>
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <a
                            className="text-brand underline"
                            href={`/api/v1/payments/${p.id}/receipt.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Receipt
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
