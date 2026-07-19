import { branches } from '@schoolmate/db';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

/**
 * First tenant-scoped route — proves the full pipeline:
 * subdomain/header → tenant resolution → withTenant() → RLS-scoped query → envelope.
 * (Real branch CRUD with permissions lands in P1-MOD-04.)
 */
export async function branchRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/branches',
    {
      schema: {
        tags: ['branches'],
        response: {
          200: z.object({
            success: z.literal(true),
            data: z.array(
              z.object({
                id: z.string().uuid(),
                name: z.string(),
                code: z.string(),
                isMainBranch: z.boolean(),
                isActive: z.boolean(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const rows = await request.tenantDb((db) =>
        db
          .select({
            id: branches.id,
            name: branches.name,
            code: branches.code,
            isMainBranch: branches.isMainBranch,
            isActive: branches.isActive,
          })
          .from(branches),
      );
      return { success: true as const, data: rows };
    },
  );
}
