import { withTenant } from '@schoolmate/db';
import { AppError, ErrorCodes, resolvePermissions, type Role } from '@schoolmate/shared';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../env.js';

interface DbUser {
  id: string;
  email: string;
  password_hash: string | null;
  status: string;
  failed_login_attempts: number;
  locked_until: Date | null;
}

interface DbRole {
  role: Role;
  branch_id: string | null;
  permissions: string[];
}

/**
 * P0-AUTH-01..04. Login is tenant-scoped (you log into a school), so these
 * routes require tenant resolution but not authentication.
 */
export async function authRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  const credentialsBody = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  // Tight limits on credential endpoints; effectively off under test.
  const strictLimit = (max: number) => ({
    max: env.NODE_ENV === 'test' ? 100_000 : max,
    timeWindow: '1 minute',
  });

  r.post(
    '/auth/login',
    {
      config: {
        permission: false,
        rateLimit: strictLimit(10),
      },
      schema: { tags: ['auth'], body: credentialsBody },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const tenant = request.tenant!;

      const userResult = await app.pgApp.query<DbUser>(
        `SELECT id, email, password_hash, status, failed_login_attempts, locked_until
         FROM users WHERE email = $1`,
        [email.toLowerCase()],
      );
      const user = userResult.rows[0];

      // Uniform error for unknown email vs wrong password — no user enumeration.
      const invalid = () =>
        new AppError(ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password', 401);

      if (!user || !user.password_hash || user.status !== 'active') throw invalid();

      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new AppError(
          ErrorCodes.ACCOUNT_LOCKED,
          'Account temporarily locked after too many failed attempts. Try again later.',
          423,
        );
      }

      const passwordOk = await bcrypt.compare(password, user.password_hash);
      if (!passwordOk) {
        // P0-AUTH-03: count failures, lock at threshold.
        const attempts = user.failed_login_attempts + 1;
        const lock = attempts >= env.LOCKOUT_MAX_ATTEMPTS;
        await app.pgApp.query(
          `UPDATE users SET failed_login_attempts = $2,
             locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
           WHERE id = $1`,
          [user.id, lock ? 0 : attempts, lock, env.LOCKOUT_MINUTES],
        );
        await logLogin(app, tenant.id, user.id, request.ip, 'failed', 'wrong_password');
        throw invalid();
      }

      // Role within THIS tenant (RLS-scoped lookup).
      const roleRows = await request.tenantDb(async (db) => {
        const res = await db.execute(
          sql`SELECT role, branch_id, permissions FROM user_tenant_roles
              WHERE user_id = ${user.id} AND is_active = true
              ORDER BY is_primary_role DESC LIMIT 1`,
        );
        return res.rows as unknown as DbRole[];
      });
      const roleResult = roleRows[0] ?? null;
      if (!roleResult) {
        await logLogin(app, tenant.id, user.id, request.ip, 'blocked', 'no_role_in_tenant');
        throw invalid();
      }

      await app.pgApp.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now()
         WHERE id = $1`,
        [user.id],
      );

      const permissions = resolvePermissions(roleResult.role, roleResult.permissions ?? []);
      const { sessionId, refreshToken } = await app.sessions.create({
        userId: user.id,
        tenantId: tenant.id,
        role: roleResult.role,
        branchId: roleResult.branch_id,
        permissions,
      });
      const accessToken = await reply.jwtSign({
        sub: user.id,
        tid: tenant.id,
        sid: sessionId,
        role: roleResult.role,
      });

      await logLogin(app, tenant.id, user.id, request.ip, 'success', null);

      return {
        success: true as const,
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            role: roleResult.role,
            branchId: roleResult.branch_id,
            permissions,
          },
        },
      };
    },
  );

  r.post(
    '/auth/refresh',
    {
      config: { permission: false, rateLimit: strictLimit(30) },
      schema: { tags: ['auth'], body: z.object({ refreshToken: z.string().min(20) }) },
    },
    async (request, reply) => {
      const rotated = await app.sessions.rotate(request.body.refreshToken);
      if (!rotated) {
        throw new AppError(ErrorCodes.TOKEN_EXPIRED, 'Refresh token is invalid or expired', 401);
      }
      const accessToken = await reply.jwtSign({
        sub: rotated.session.userId,
        tid: rotated.session.tenantId,
        sid: rotated.sessionId,
        role: rotated.session.role,
      });
      return {
        success: true as const,
        data: { accessToken, refreshToken: rotated.refreshToken },
      };
    },
  );

  r.post(
    '/auth/logout',
    { config: { permission: true }, schema: { tags: ['auth'] } },
    async (request) => {
      const auth = request.auth!;
      await app.sessions.destroy(auth.sessionId, auth.userId);
      return { success: true as const, data: { loggedOut: true } };
    },
  );

  r.post(
    '/auth/logout-all',
    { config: { permission: true }, schema: { tags: ['auth'] } },
    async (request) => {
      const auth = request.auth!;
      const count = await app.sessions.destroyAll(auth.userId);
      return { success: true as const, data: { sessionsTerminated: count } };
    },
  );

  r.get(
    '/auth/me',
    { config: { permission: true }, schema: { tags: ['auth'] } },
    async (request) => {
      const auth = request.auth!;
      return {
        success: true as const,
        data: {
          userId: auth.userId,
          tenantId: auth.tenantId,
          role: auth.role,
          branchId: auth.branchId,
          permissions: auth.permissions,
        },
      };
    },
  );

  // P1-MOD-14: passwordless login via a magic-link invite token. The parent
  // never sets a password; clicking the link logs them straight in.
  r.post(
    '/auth/accept-invite',
    {
      config: { permission: false, rateLimit: strictLimit(10) },
      schema: { tags: ['auth'], body: z.object({ token: z.string().min(20) }) },
    },
    async (request, reply) => {
      const tenant = request.tenant!;
      const raw = await app.redis.get(`invite:${request.body.token}`);
      const invalid = () =>
        new AppError(ErrorCodes.TOKEN_EXPIRED, 'Invite link is invalid or expired', 400);
      if (!raw) throw invalid();

      const { userId, tenantId } = JSON.parse(raw) as { userId: string; tenantId: string };
      // The link is bound to the tenant it was issued for.
      if (tenantId !== tenant.id) throw invalid();

      const roleRows = await request.tenantDb(async (db) => {
        const res = await db.execute(
          sql`SELECT role, branch_id, permissions FROM user_tenant_roles
              WHERE user_id = ${userId} AND is_active = true
              ORDER BY is_primary_role DESC LIMIT 1`,
        );
        return res.rows as unknown as DbRole[];
      });
      const roleResult = roleRows[0];
      if (!roleResult) throw invalid();

      // Single-use: consume the token, mark the email verified.
      await app.redis.del(`invite:${request.body.token}`);
      await app.pgApp.query(
        `UPDATE users SET is_email_verified = true, last_login_at = now() WHERE id = $1`,
        [userId],
      );

      const permissions = resolvePermissions(roleResult.role, roleResult.permissions ?? []);
      const { sessionId, refreshToken } = await app.sessions.create({
        userId,
        tenantId: tenant.id,
        role: roleResult.role,
        branchId: roleResult.branch_id,
        permissions,
      });
      const accessToken = await reply.jwtSign({
        sub: userId,
        tid: tenant.id,
        sid: sessionId,
        role: roleResult.role,
      });
      await logLogin(app, tenant.id, userId, request.ip, 'success', 'invite');

      return {
        success: true as const,
        data: {
          accessToken,
          refreshToken,
          user: { id: userId, role: roleResult.role, branchId: roleResult.branch_id, permissions },
        },
      };
    },
  );

  r.post(
    '/auth/forgot-password',
    {
      config: { permission: false, rateLimit: strictLimit(5) },
      schema: { tags: ['auth'], body: z.object({ email: z.string().email() }) },
    },
    async (request) => {
      const { rows } = await app.pgApp.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1 AND status = 'active'`,
        [request.body.email.toLowerCase()],
      );
      const user = rows[0];
      if (user) {
        const token = randomBytes(32).toString('base64url');
        await app.redis.set(`pwreset:${token}`, user.id, 'EX', env.PASSWORD_RESET_TTL_SECONDS);
        // TODO(P1-API-02): dispatch via notification engine. Dev: mailpit/log.
        request.log.info({ userId: user.id }, 'password reset token issued');
      }
      // Same response either way — no user enumeration.
      return {
        success: true as const,
        data: { message: 'If that email exists, a reset link has been sent' },
      };
    },
  );

  r.post(
    '/auth/reset-password',
    {
      config: { permission: false, rateLimit: strictLimit(5) },
      schema: {
        tags: ['auth'],
        body: z.object({ token: z.string().min(20), newPassword: z.string().min(8) }),
      },
    },
    async (request) => {
      const key = `pwreset:${request.body.token}`;
      const userId = await app.redis.get(key);
      if (!userId) {
        throw new AppError(ErrorCodes.TOKEN_EXPIRED, 'Reset link is invalid or expired', 400);
      }
      const passwordHash = await bcrypt.hash(request.body.newPassword, 10);
      await app.pgApp.query(
        `UPDATE users SET password_hash = $2, failed_login_attempts = 0, locked_until = NULL
         WHERE id = $1`,
        [userId, passwordHash],
      );
      await app.redis.del(key);
      // Password change invalidates every existing session.
      await app.sessions.destroyAll(userId);
      return { success: true as const, data: { message: 'Password updated. Please log in.' } };
    },
  );
}

async function logLogin(
  app: FastifyInstance,
  tenantId: string,
  userId: string,
  ip: string,
  status: 'success' | 'failed' | 'blocked',
  reason: string | null,
): Promise<void> {
  // login_history is tenant-scoped (RLS) → write inside a tenant transaction.
  await withTenant(app.pgApp, tenantId, (db) =>
    db.execute(
      sql`INSERT INTO login_history (tenant_id, user_id, ip_address, status, failure_reason)
          VALUES (${tenantId}, ${userId}, ${ip}, ${status}::login_status, ${reason})`,
    ),
  ).catch((err) => app.log.warn({ err }, 'login_history write failed'));
}
