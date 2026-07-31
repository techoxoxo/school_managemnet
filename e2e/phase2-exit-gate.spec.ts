import { existsSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * P2-QA-01 — Phase 2 exit gate.
 * Two money/marks golden paths on the seeded `springfield` tenant:
 *   A. fee structure → allocate → collect (cash) → receipt PDF
 *   B. grading → exam → datesheet → marks → compute → publish → report-card PDF
 *
 * The online-gateway leg of the gate (Razorpay sandbox) is deferred with
 * P2-MOD-08; cash collection stands in here. PDF byte-assertions are skipped
 * when Chrome is unavailable (the API returns 503), matching the unit tests.
 *
 * Requires the seeded tenant (npm run seed -w @schoolmate/db):
 *   springfield / admin@springfield.test / admin123
 */

const SLUG = 'springfield';
const suffix = Date.now().toString(36);
const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_UP = existsSync(CHROME_PATH);

async function login(request: APIRequestContext): Promise<string> {
  const res = await request.post('/auth/login', {
    headers: { 'x-tenant-slug': SLUG },
    data: { email: 'admin@springfield.test', password: 'admin123' },
  });
  expect(res.status(), 'seed tenant must exist — run `npm run seed -w @schoolmate/db`').toBe(200);
  return (await res.json()).data.accessToken;
}

function api(request: APIRequestContext, token: string) {
  const h = { 'x-tenant-slug': SLUG, authorization: `Bearer ${token}` };
  return {
    post: async (url: string, data: unknown) => {
      const res = await request.post(url, { headers: h, data });
      expect(res.status(), `${url} → ${res.status()}`).toBeLessThan(300);
      return (await res.json()).data;
    },
    getPdf: async (url: string) => request.get(url, { headers: h }),
  };
}

async function scaffold(a: ReturnType<typeof api>, tag: string) {
  const branch = await a.post('/v1/branches', {
    name: `E2E ${tag}`,
    code: `E2E${tag}`.slice(0, 12),
  });
  const session = await a.post('/v1/academic-sessions', {
    branchId: branch.id,
    name: `S-${tag}`,
    startDate: '2026-04-01',
    endDate: '2027-03-31',
  });
  const klass = await a.post('/v1/classes', {
    branchId: branch.id,
    name: `Grade ${tag}`,
    classType: 'secondary',
  });
  const student = await a.post('/v1/students', {
    branchId: branch.id,
    admissionNumber: `E2E-${tag}`,
    firstName: 'Golden',
    lastName: 'Path',
    currentClassId: klass.id,
  });
  return { branch, session, klass, student };
}

test('exit gate A: fee structure → allocate → collect → receipt PDF', async ({ request }) => {
  const a = api(request, await login(request));
  const { branch, session, klass, student } = await scaffold(a, `fee${suffix}`);

  const structure = await a.post('/v1/fee-structures', {
    branchId: branch.id,
    academicSessionId: session.id,
    classId: klass.id,
    name: 'Exit Gate Fees',
    items: [
      { head: 'Tuition', amount: 120000, frequency: 'monthly' },
      { head: 'Admission', amount: 500000, frequency: 'one_time' },
    ],
  });
  const alloc = await a.post(`/v1/fee-structures/${structure.id}/allocate`, {});
  expect(alloc.duesCreated).toBeGreaterThan(0);

  // Collect a partial payment against the oldest dues (FIFO).
  const pay = await a.post(`/v1/students/${student.id}/payments`, {
    amount: 300000,
    method: 'cash',
  });
  expect(pay.allocated).toBe(300000);
  expect(pay.payment.receiptNumber).toMatch(/^R-\d{4}-\d{6}$/);

  // Outstanding reflects the payment.
  const fees = await request
    .get(`/v1/students/${student.id}/fees`, {
      headers: { 'x-tenant-slug': SLUG, authorization: `Bearer ${await login(request)}` },
    })
    .then((r) => r.json());
  expect(fees.data.totalOutstanding).toBeGreaterThan(0);

  test.skip(!CHROME_UP, 'Chrome required to render the receipt PDF');
  const pdf = await a.getPdf(`/v1/payments/${pay.payment.id}/receipt.pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
});

test('exit gate B: marks → compute → publish → report-card PDF', async ({ request }) => {
  const a = api(request, await login(request));
  const { branch, session, klass, student } = await scaffold(a, `exam${suffix}`);

  const subject = await a.post('/v1/subjects', {
    branchId: branch.id,
    name: 'Science',
    code: `SCI-${suffix}`,
  });
  const grading = await a.post('/v1/grading-systems/from-preset', {
    branchId: branch.id,
    preset: 'cbse',
  });
  const exam = await a.post('/v1/exams', {
    branchId: branch.id,
    academicSessionId: session.id,
    classId: klass.id,
    gradingSystemId: grading.id,
    name: 'Final',
  });
  const es = await a.post(`/v1/exams/${exam.id}/subjects`, {
    subjectId: subject.id,
    examDate: '2026-12-01',
    maxMarks: 100,
    passMarks: 33,
  });

  await a.post(`/v1/exam-subjects/${es.id}/marks`, {
    entries: [{ studentId: student.id, marksObtained: 91 }],
  });
  const compute = await a.post(`/v1/exams/${exam.id}/compute`, {});
  expect(compute.students).toBe(1);

  const publish = await a.post(`/v1/exams/${exam.id}/publish`, {});
  expect(publish.published).toBeGreaterThanOrEqual(1);

  // Published card is visible to the student-facing endpoint.
  const cards = await request
    .get(`/v1/students/${student.id}/report-cards`, {
      headers: { 'x-tenant-slug': SLUG, authorization: `Bearer ${await login(request)}` },
    })
    .then((r) => r.json());
  expect(cards.data).toHaveLength(1);

  test.skip(!CHROME_UP, 'Chrome required to render the report-card PDF');
  const pdf = await a.getPdf(`/v1/exams/${exam.id}/students/${student.id}/report-card.pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
});
