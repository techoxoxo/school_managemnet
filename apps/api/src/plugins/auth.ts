import jwt from '@fastify/jwt';
import { AppError, ErrorCodes, hasPermission, type Role } from '@schoolmate/shared';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { randomBytes, randomUUID } from 'node:crypto';
import { env } from '../env.js';

/** Access-token JWT claims — deliberately small (Plan §5). */
export interface AccessTokenPayload {
  sub: string; // user id
  tid: string; // tenant id
  sid: string; // session id (Redis-backed → instant revocation)
  role: Role;
}

/** Server-side session state (Redis). Force-logout = delete this key. */
export interface SessionRecord {
  userId: string;
  tenantId: string;
  role: Role;
  branchId: string | null;
  permissions: string[];
  refreshToken: string;
  createdAt: string;
}

/** Authenticated request context, set by the global guard. */
export interface AuthContext {
  userId: string;
  tenantId: string;
  sessionId: string;
  role: Role;
  branchId: string | null;
  permissions: string[];
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    sessions: {
      create(record: Omit<SessionRecord, 'refreshToken' | 'createdAt'>): Promise<{
        sessionId: string;
        refreshToken: string;
      }>;
      rotate(
        refreshToken: string,
      ): Promise<{ session: SessionRecord; sessionId: string; refreshToken: string } | null>;
      destroy(sessionId: string, userId: string): Promise<void>;
      destroyAll(userId: string): Promise<number>;
      get(sessionId: string): Promise<SessionRecord | null>;
    };
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyContextConfig {
    /**
     * Route auth declaration (P0-AUTH-05/07 — enforced by the permission-matrix test):
     *  - string  → requires this `module.action` permission
     *  - true    → any authenticated user
     *  - false   → public (login, health, docs)
     */
    permission?: string | boolean;
  }
}

const sessionKey = (sid: string) => `session:${sid}`;
const userSessionsKey = (uid: string) => `user-sessions:${uid}`;

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
  });

  app.decorateRequest('auth', null);

  // ── Session store (P0-AUTH-01/02): refresh tokens live ONLY in Redis ──
  const sessions: FastifyInstance['sessions'] = {
    async create(record: Omit<SessionRecord, 'refreshToken' | 'createdAt'>) {
      const sessionId = randomUUID();
      const refreshToken = `${sessionId}.${randomBytes(32).toString('base64url')}`;
      const session: SessionRecord = {
        ...record,
        refreshToken,
        createdAt: new Date().toISOString(),
      };
      await app.redis.set(
        sessionKey(sessionId),
        JSON.stringify(session),
        'EX',
        env.REFRESH_TOKEN_TTL_SECONDS,
      );
      await app.redis.sadd(userSessionsKey(record.userId), sessionId);
      return { sessionId, refreshToken };
    },

    async get(sessionId: string) {
      const raw = await app.redis.get(sessionKey(sessionId));
      return raw ? (JSON.parse(raw) as SessionRecord) : null;
    },

    /** Rotation (P0-AUTH-02): old refresh token dies the moment it is used. */
    async rotate(refreshToken: string) {
      const sessionId = refreshToken.split('.')[0];
      if (!sessionId) return null;
      const session = await sessions.get(sessionId);
      if (!session || session.refreshToken !== refreshToken) {
        // Reuse of a rotated token → possible theft; kill the whole session.
        if (session) await sessions.destroy(sessionId, session.userId);
        return null;
      }
      const next = `${sessionId}.${randomBytes(32).toString('base64url')}`;
      session.refreshToken = next;
      await app.redis.set(
        sessionKey(sessionId),
        JSON.stringify(session),
        'EX',
        env.REFRESH_TOKEN_TTL_SECONDS,
      );
      return { session, sessionId, refreshToken: next };
    },

    async destroy(sessionId: string, userId: string) {
      await app.redis.del(sessionKey(sessionId));
      await app.redis.srem(userSessionsKey(userId), sessionId);
    },

    /** Force-logout everywhere (admin "kill sessions" uses this too). */
    async destroyAll(userId: string) {
      const sids = await app.redis.smembers(userSessionsKey(userId));
      if (sids.length > 0) {
        await app.redis.del(...sids.map(sessionKey));
      }
      await app.redis.del(userSessionsKey(userId));
      return sids.length;
    },
  };
  app.decorate('sessions', sessions);

  // ── Global guard (P0-AUTH-05): one enforcement point for every route ──
  app.addHook('preHandler', async (request) => {
    const required = request.routeOptions.config.permission;
    if (required === false || required === undefined) return;

    let payload: AccessTokenPayload;
    try {
      payload = await request.jwtVerify<AccessTokenPayload>();
    } catch {
      throw new AppError(ErrorCodes.UNAUTHENTICATED, 'Missing or invalid access token', 401);
    }

    // Instant revocation: token is only as alive as its Redis session.
    const session = await app.sessions.get(payload.sid);
    if (!session) {
      throw new AppError(ErrorCodes.TOKEN_EXPIRED, 'Session has been terminated', 401);
    }

    // Token must belong to the tenant it is being used on.
    if (request.tenant && session.tenantId !== request.tenant.id) {
      throw new AppError(ErrorCodes.FORBIDDEN, 'Token does not belong to this tenant', 403);
    }

    if (typeof required === 'string' && !hasPermission(session.permissions, required)) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, `Missing permission '${required}'`, 403);
    }

    request.auth = {
      userId: session.userId,
      tenantId: session.tenantId,
      sessionId: payload.sid,
      role: session.role,
      branchId: session.branchId,
      permissions: session.permissions,
    };
  });
});

/**
 * ABAC foundation (P0-AUTH-06): branch-scoped roles may only touch their
 * own branch. Module routes call this with the branch they're acting on;
 * deeper scopes (teacher→own classes, parent→own children) build on the
 * same AuthContext as modules land in Phase 1+.
 */
export function assertBranchScope(auth: AuthContext, branchId: string): void {
  if (auth.role === 'branch_admin' && auth.branchId && auth.branchId !== branchId) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Outside your branch scope', 403);
  }
}
