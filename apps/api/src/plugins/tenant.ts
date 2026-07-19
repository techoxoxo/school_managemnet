import { AppError, ErrorCodes } from '@schoolmate/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env.js';

export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  subscriptionStatus: string;
  instituteType: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved tenant (P0-API-03). Null only on routes marked `config.tenant: false`. */
    tenant: TenantContext | null;
  }
  interface FastifyContextConfig {
    /** Set to false on platform/public routes (health, docs) to skip tenant resolution. */
    tenant?: boolean;
  }
}

function extractSlug(request: FastifyRequest): string | null {
  // 1. Explicit header (API clients, dev tooling)
  const header = request.headers['x-tenant-slug'];
  if (typeof header === 'string' && header.length > 0) return header;

  // 2. Subdomain: springfield.<BASE_DOMAIN>
  const host = (request.headers.host ?? '').split(':')[0] ?? '';
  if (host.endsWith(`.${env.BASE_DOMAIN}`)) {
    const sub = host.slice(0, -(env.BASE_DOMAIN.length + 1));
    if (sub && !sub.includes('.')) return sub;
  }
  return null;
}

/**
 * P0-API-03 (Plan §3): slug → Redis cache → DB → request.tenant.
 * Suspended/inactive tenants are rejected here, before any business logic.
 */
export const tenantPlugin = fp(
  async (app: FastifyInstance) => {
    app.decorateRequest('tenant', null);

    app.addHook('onRequest', async (request) => {
      if (request.routeOptions.config.tenant === false) return;
      // Unmatched route: let the 404 handler answer instead of demanding a tenant.
      if (!request.routeOptions.url) return;
      // Swagger UI registers its own routes without our config flag.
      if (request.routeOptions.url.startsWith('/docs')) return;

      const slug = extractSlug(request);
      if (!slug) {
        throw new AppError(
          ErrorCodes.TENANT_NOT_FOUND,
          'No tenant specified (use a tenant subdomain or the X-Tenant-Slug header)',
          400,
        );
      }

      const cacheKey = `tenant:slug:${slug}`;
      let tenant: TenantContext | null = null;

      const cached = await app.redis.get(cacheKey).catch(() => null);
      if (cached) {
        tenant = JSON.parse(cached) as TenantContext;
      } else {
        // Platform-level table (no RLS) — readable by the app role without tenant context.
        const result = await app.pgApp.query<{
          id: string;
          slug: string;
          name: string;
          subscription_status: string;
          institute_type: string;
          is_active: boolean;
        }>(
          `SELECT id, slug, name, subscription_status, institute_type, is_active
           FROM tenants WHERE slug = $1`,
          [slug],
        );
        const row = result.rows[0];
        if (row) {
          tenant = {
            id: row.id,
            slug: row.slug,
            name: row.name,
            subscriptionStatus: row.subscription_status,
            instituteType: row.institute_type,
          };
          if (row.is_active) {
            await app.redis
              .set(cacheKey, JSON.stringify(tenant), 'EX', env.TENANT_CACHE_TTL)
              .catch(() => undefined);
          }
        }
      }

      if (!tenant) {
        throw new AppError(ErrorCodes.TENANT_NOT_FOUND, `Unknown tenant '${slug}'`, 404);
      }
      if (tenant.subscriptionStatus === 'suspended' || tenant.subscriptionStatus === 'churned') {
        throw new AppError(ErrorCodes.TENANT_SUSPENDED, 'This account is suspended', 403);
      }

      request.tenant = tenant;
    });
  },
  { dependencies: [] },
);

/** Cache invalidation helper — call whenever a tenant's config/status changes. */
export async function invalidateTenantCache(app: FastifyInstance, slug: string): Promise<void> {
  await app.redis.del(`tenant:slug:${slug}`);
}
