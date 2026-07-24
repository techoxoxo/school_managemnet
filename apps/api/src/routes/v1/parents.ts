import { emitEvent, parents, users, userTenantRoles } from '@schoolmate/db';
import { AppError, ErrorCodes, EVENT_TYPES } from '@schoolmate/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { writeAudit } from '../../lib/audit.js';
import { assertFound, idParamSchema } from '../../lib/http.js';
import { registerCrud } from '../../lib/crud.js';

const relation = z.enum(['father', 'mother', 'guardian', 'other']);

const createSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  relation: relation.optional(),
  phone: z.string().max(30).optional(),
  altPhone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  occupation: z.string().max(120).optional(),
  employer: z.string().max(160).optional(),
  annualIncome: z.number().int().min(0).optional(),
});

/** Magic-link invites live in Redis for 7 days. */
const INVITE_TTL_SECONDS = 7 * 24 * 3600;

export async function parentRoutes(app: FastifyInstance) {
  registerCrud(app, {
    path: 'parents',
    entity: 'Parent',
    auditType: 'parent',
    permissionPrefix: 'parent',
    tags: ['parents'],
    table: parents,
    idColumn: parents.id,
    orderColumn: parents.firstName,
    searchColumn: parents.firstName,
    hasUpdatedAt: true,
    createSchema,
    updateSchema: createSchema.partial(),
  });

  // ── Parent account auto-provisioning via magic-link (P1-MOD-14) ─
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/parents/:id/invite',
    {
      config: { permission: 'parent.manage' },
      schema: {
        tags: ['parents'],
        params: idParamSchema,
        body: z.object({ email: z.string().email().optional() }),
      },
    },
    async (request, reply) => {
      // A magic-link identity still needs an email column (users.email is
      // NOT NULL); SMS delivery reuses the same token via the event payload.
      const token = randomBytes(32).toString('base64url');
      const provisioned = await request.tenantDb(async (db) => {
        const [parent] = await db
          .select()
          .from(parents)
          .where(eq(parents.id, request.params.id))
          .limit(1);
        assertFound(parent, 'Parent');

        const email = request.body.email ?? parent.email;
        if (!email) {
          throw new AppError(
            ErrorCodes.VALIDATION_ERROR,
            'Parent has no email; pass one to invite them',
            400,
          );
        }

        // Reuse-or-create the platform identity (users has no RLS).
        const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        let user = existing;
        const isNewUser = !existing;
        if (!user) {
          [user] = await db.insert(users).values({ email, status: 'active' }).returning();
        }

        if (!parent.userId) {
          await db
            .update(parents)
            .set({ userId: user!.id, updatedAt: new Date() })
            .where(eq(parents.id, parent.id));
        }
        await db
          .insert(userTenantRoles)
          .values({ userId: user!.id, tenantId: request.tenant!.id, role: 'parent' })
          .onConflictDoNothing({
            target: [userTenantRoles.userId, userTenantRoles.tenantId, userTenantRoles.role],
          });

        await writeAudit(db, request.auth!, {
          action: 'create',
          entityType: 'parent_invite',
          entityId: parent.id,
          newValues: { parentId: parent.id, userId: user!.id, email },
        });
        // The notification engine builds and sends the magic link (SMS/email).
        await emitEvent(db, {
          tenantId: request.tenant!.id,
          type: EVENT_TYPES.PARENT_INVITED,
          aggregateType: 'parent',
          aggregateId: parent.id,
          payload: {
            parentId: parent.id,
            userId: user!.id,
            email,
            phone: parent.phone ?? undefined,
            token,
          },
        });
        return { userId: user!.id, email, isNewUser };
      });

      await app.redis.set(
        `invite:${token}`,
        JSON.stringify({ userId: provisioned.userId, tenantId: request.tenant!.id }),
        'EX',
        INVITE_TTL_SECONDS,
      );

      return reply
        .status(201)
        .send({ success: true as const, data: { ...provisioned, inviteToken: token } });
    },
  );
}
