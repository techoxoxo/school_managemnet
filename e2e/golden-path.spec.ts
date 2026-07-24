import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * P1-QA-01 — Phase 1 exit gate.
 * The golden path on the seeded `springfield` tenant (already onboarded):
 * login → class → section → admit student → link parent → mark attendance
 * absent → assert the absent-notification event fired.
 *
 * Requires the seeded tenant (npm run seed -w @schoolmate/db):
 *   springfield / admin@springfield.test / admin123
 */

const SLUG = 'springfield';
const suffix = Date.now().toString(36);

async function login(request: APIRequestContext): Promise<string> {
  const res = await request.post('/auth/login', {
    headers: { 'x-tenant-slug': SLUG },
    data: { email: 'admin@springfield.test', password: 'admin123' },
  });
  expect(res.status(), 'seed tenant must exist — run `npm run seed -w @schoolmate/db`').toBe(200);
  return (await res.json()).data.accessToken;
}

test('golden path: class → admit student → mark attendance → absent notification', async ({
  request,
}) => {
  const token = await login(request);
  const h = { 'x-tenant-slug': SLUG, authorization: `Bearer ${token}` };
  const post = async (url: string, data: unknown) => {
    const res = await request.post(url, { headers: h, data });
    expect(res.status(), `${url} → ${res.status()}`).toBeLessThan(300);
    return (await res.json()).data;
  };

  // 1. Structure: a branch, class, and section.
  const branch = await post('/v1/branches', {
    name: `E2E ${suffix}`,
    code: `E2E${suffix}`.slice(0, 12),
  });
  const klass = await post('/v1/classes', {
    branchId: branch.id,
    name: `Grade ${suffix}`,
    classType: 'primary',
  });
  const section = await post('/v1/sections', { branchId: branch.id, classId: klass.id, name: 'A' });

  // 2. Admit a student into that section.
  const student = await post('/v1/students', {
    branchId: branch.id,
    admissionNumber: `E2E-${suffix}`,
    firstName: 'Gina',
    currentClassId: klass.id,
    currentSectionId: section.id,
  });

  // 3. Link a parent with a phone (so an absence can notify them).
  const parent = await post('/v1/parents', { firstName: 'Guardian', phone: '555-0100' });
  await post(`/v1/students/${student.id}/parents`, {
    parentId: parent.id,
    isPrimaryContact: true,
  });

  // 4. Mark the student absent for the day.
  const result = await post('/v1/attendance/mark', {
    branchId: branch.id,
    sectionId: section.id,
    date: '2026-09-15',
    entries: [{ studentId: student.id, status: 'absent' }],
  });

  // 5. The absent flow emitted a parent notification (P1-API-03).
  expect(result).toMatchObject({ marked: 1, absent: 1, notified: 1 });
});
