/**
 * P1-MOD-10: student documents — presigned upload, checklist, verification.
 * Bytes go to S3/MinIO via presigned URLs; this API manages metadata and the
 * pending→verified/rejected workflow. Tenant-scoped (RLS) + audited.
 */
import { studentDocuments, students } from '@schoolmate/db';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';
import { assertFound } from '../../lib/http.js';
import {
  buildStorageKey,
  deleteObject,
  presignDownload,
  presignUpload,
} from '../../lib/storage.js';

const docType = z.enum([
  'photo',
  'birth_certificate',
  'aadhaar',
  'transfer_certificate',
  'marksheet',
  'address_proof',
  'other',
]);

/** Documents every student should have on file (drives the checklist). */
const REQUIRED_DOCS = ['photo', 'birth_certificate', 'aadhaar'] as const;

export async function studentDocumentRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const view = { permission: 'student.view' };
  const manage = { permission: 'student.manage' };
  const studentParam = z.object({ id: z.string().uuid() });
  const docParam = z.object({ id: z.string().uuid(), docId: z.string().uuid() });

  // Request a presigned PUT URL (browser uploads the bytes directly).
  r.post(
    '/students/:id/documents/upload-url',
    {
      config: manage,
      schema: {
        tags: ['documents'],
        params: studentParam,
        body: z.object({ docType, fileName: z.string().min(1).max(200) }),
      },
    },
    async (request) => {
      const [student] = await request.tenantDb((db) =>
        db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.id, request.params.id))
          .limit(1),
      );
      assertFound(student, 'Student');
      const key = buildStorageKey(
        request.tenant!.id,
        request.params.id,
        randomUUID(),
        request.body.fileName,
      );
      const uploadUrl = await presignUpload(key);
      return { success: true as const, data: { uploadUrl, storageKey: key } };
    },
  );

  // Record a document after the client has uploaded it.
  r.post(
    '/students/:id/documents',
    {
      config: manage,
      schema: {
        tags: ['documents'],
        params: studentParam,
        body: z.object({
          docType,
          fileName: z.string().min(1).max(200),
          storageKey: z.string().min(1).max(500),
          contentType: z.string().max(120).optional(),
          sizeBytes: z.number().int().min(0).optional(),
        }),
      },
    },
    async (request, reply) => {
      const created = await request.tenantDb(async (db) => {
        const [student] = await db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.id, request.params.id))
          .limit(1);
        assertFound(student, 'Student');
        const [row] = await db
          .insert(studentDocuments)
          .values({
            tenantId: request.tenant!.id,
            studentId: request.params.id,
            docType: request.body.docType,
            fileName: request.body.fileName,
            storageKey: request.body.storageKey,
            contentType: request.body.contentType ?? null,
            sizeBytes: request.body.sizeBytes ?? null,
            uploadedBy: request.auth!.userId,
          })
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'student_document',
          entityId: row!.id,
          newValues: {
            studentId: request.params.id,
            docType: row!.docType,
            fileName: row!.fileName,
          },
        });
        return row!;
      });
      return reply.status(201).send({ success: true as const, data: created });
    },
  );

  // List documents + the required-document checklist.
  r.get(
    '/students/:id/documents',
    { config: view, schema: { tags: ['documents'], params: studentParam } },
    async (request) => {
      const rows = await request.tenantDb((db) =>
        db
          .select()
          .from(studentDocuments)
          .where(eq(studentDocuments.studentId, request.params.id))
          .orderBy(desc(studentDocuments.createdAt)),
      );
      const checklist = REQUIRED_DOCS.map((type) => {
        const doc = rows.find((d) => d.docType === type);
        return {
          docType: type,
          required: true,
          present: Boolean(doc),
          status: doc?.status ?? null,
        };
      });
      return { success: true as const, data: { documents: rows, checklist } };
    },
  );

  // Presigned download URL for a stored document.
  r.get(
    '/students/:id/documents/:docId/download-url',
    { config: view, schema: { tags: ['documents'], params: docParam } },
    async (request) => {
      const [doc] = await request.tenantDb((db) =>
        db
          .select()
          .from(studentDocuments)
          .where(
            and(
              eq(studentDocuments.id, request.params.docId),
              eq(studentDocuments.studentId, request.params.id),
            ),
          )
          .limit(1),
      );
      assertFound(doc, 'Document');
      const url = await presignDownload(doc.storageKey, doc.fileName);
      return { success: true as const, data: { downloadUrl: url } };
    },
  );

  // Verification workflow: mark verified or rejected.
  r.post(
    '/students/:id/documents/:docId/verify',
    {
      config: manage,
      schema: {
        tags: ['documents'],
        params: docParam,
        body: z.object({
          status: z.enum(['verified', 'rejected']),
          remarks: z.string().max(300).optional(),
        }),
      },
    },
    async (request) => {
      const updated = await request.tenantDb(async (db) => {
        const [before] = await db
          .select()
          .from(studentDocuments)
          .where(
            and(
              eq(studentDocuments.id, request.params.docId),
              eq(studentDocuments.studentId, request.params.id),
            ),
          )
          .limit(1);
        assertFound(before, 'Document');
        const [row] = await db
          .update(studentDocuments)
          .set({
            status: request.body.status,
            remarks: request.body.remarks ?? null,
            verifiedBy: request.auth!.userId,
            verifiedAt: new Date(),
          })
          .where(eq(studentDocuments.id, request.params.docId))
          .returning();
        await writeAudit(db, request.auth!, {
          action: 'update',
          entityType: 'student_document',
          entityId: request.params.docId,
          oldValues: { status: before.status },
          newValues: { status: row!.status, remarks: request.body.remarks },
        });
        return row!;
      });
      return { success: true as const, data: updated };
    },
  );

  r.delete(
    '/students/:id/documents/:docId',
    { config: manage, schema: { tags: ['documents'], params: docParam } },
    async (request) => {
      const key = await request.tenantDb(async (db) => {
        const [doc] = await db
          .select()
          .from(studentDocuments)
          .where(
            and(
              eq(studentDocuments.id, request.params.docId),
              eq(studentDocuments.studentId, request.params.id),
            ),
          )
          .limit(1);
        assertFound(doc, 'Document');
        await db.delete(studentDocuments).where(eq(studentDocuments.id, request.params.docId));
        await writeAudit(db, request.auth!, {
          action: 'delete',
          entityType: 'student_document',
          entityId: request.params.docId,
          oldValues: { docType: doc.docType, fileName: doc.fileName },
        });
        return doc.storageKey;
      });
      await deleteObject(key); // best-effort object cleanup
      return { success: true as const, data: { deleted: true } };
    },
  );
}
