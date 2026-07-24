/**
 * P1-MOD-17: student search via Meilisearch. Indexing is best-effort — a
 * failure here (Meili down, network) never breaks a DB write; it just logs.
 * Search is tenant-scoped via a filter on tenantId, and the API re-loads the
 * matched rows from Postgres (RLS) so nothing sensitive lives only in the
 * index and masking/permissions still apply.
 */
import { MeiliSearch } from 'meilisearch';
import { env } from '../env.js';

const STUDENTS_INDEX = 'students';

let client: MeiliSearch | null = null;
function getClient(): MeiliSearch {
  if (!client) client = new MeiliSearch({ host: env.MEILI_HOST, apiKey: env.MEILI_MASTER_KEY });
  return client;
}

export interface StudentSearchDoc {
  id: string;
  tenantId: string;
  branchId: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName: string;
  lastName: string | null;
  status: string;
  currentClassId: string | null;
  currentSectionId: string | null;
}

/** Idempotently ensure the students index exists with the right attributes. */
export async function ensureStudentIndex(): Promise<void> {
  const c = getClient();
  await c.createIndex(STUDENTS_INDEX, { primaryKey: 'id' }).catch(() => undefined);
  const index = c.index(STUDENTS_INDEX);
  await index.updateSettings({
    filterableAttributes: ['tenantId', 'branchId', 'status', 'currentClassId', 'currentSectionId'],
    searchableAttributes: ['firstName', 'lastName', 'admissionNumber', 'rollNumber'],
  });
}

let ensured: Promise<void> | null = null;
/** Ensure the index+settings exist exactly once per process. */
function ensureOnce(): Promise<void> {
  if (!ensured) ensured = ensureStudentIndex().catch(() => undefined);
  return ensured;
}

/** Fire-and-forget upsert (does not wait for the indexing task). */
export function indexStudent(doc: StudentSearchDoc): void {
  ensureOnce()
    .then(() => getClient().index(STUDENTS_INDEX).addDocuments([doc]))
    .catch((err) => console.warn('[search] index student failed', err?.message ?? err));
}

export function removeStudent(id: string): void {
  getClient()
    .index(STUDENTS_INDEX)
    .deleteDocument(id)
    .catch((err) => console.warn('[search] remove student failed', err?.message ?? err));
}

/** Bulk upsert, awaiting completion (used by reindex so callers see fresh data). */
export async function reindexStudents(docs: StudentSearchDoc[]): Promise<void> {
  await ensureStudentIndex();
  const index = getClient().index(STUDENTS_INDEX);
  if (docs.length > 0) {
    const task = await index.addDocuments(docs);
    await getClient().waitForTask(task.taskUid);
  }
}

/** Returns matching student ids for a tenant, best-relevance first. */
export async function searchStudentIds(
  tenantId: string,
  q: string,
  filters: {
    classId?: string | undefined;
    sectionId?: string | undefined;
    status?: string | undefined;
  } = {},
  limit = 50,
): Promise<string[]> {
  const filter = [`tenantId = "${tenantId}"`];
  if (filters.classId) filter.push(`currentClassId = "${filters.classId}"`);
  if (filters.sectionId) filter.push(`currentSectionId = "${filters.sectionId}"`);
  if (filters.status) filter.push(`status = "${filters.status}"`);

  await ensureOnce();
  const res = await getClient()
    .index(STUDENTS_INDEX)
    .search(q, { filter, limit, attributesToRetrieve: ['id'] });
  return (res.hits as Array<{ id: string }>).map((h) => h.id);
}

export function toStudentDoc(row: {
  id: string;
  tenantId: string;
  branchId: string;
  admissionNumber: string;
  rollNumber: string | null;
  firstName: string;
  lastName: string | null;
  status: string;
  currentClassId: string | null;
  currentSectionId: string | null;
}): StudentSearchDoc {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    admissionNumber: row.admissionNumber,
    rollNumber: row.rollNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    status: row.status,
    currentClassId: row.currentClassId,
    currentSectionId: row.currentSectionId,
  };
}
