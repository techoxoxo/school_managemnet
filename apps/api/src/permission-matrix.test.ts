/**
 * P0-AUTH-07: CI fails if any route lacks an explicit auth declaration.
 * Every route must state ONE of:
 *   config.permission: 'module.action'  → permission-guarded
 *   config.permission: true             → any authenticated user
 *   config.permission: false            → intentionally public
 *   config.tenant: false                → platform/public infrastructure (health)
 * Swagger's own /docs routes are the single allowed exception.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('permission matrix (P0-AUTH-07)', () => {
  it('every route declares its auth posture', () => {
    const undeclared = app.routeRegistry.filter((r) => {
      if (r.url.startsWith('/docs')) return false;
      if (r.tenant === false) return false;
      return r.permission === undefined;
    });
    expect(
      undeclared,
      `Routes missing config.permission declaration:\n${undeclared
        .map((r) => `  ${r.method} ${r.url}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('permission strings reference module.action format', () => {
    const bad = app.routeRegistry.filter(
      (r) => typeof r.permission === 'string' && !/^[a-z_]+\.[a-z_*]+$/.test(r.permission),
    );
    expect(bad).toEqual([]);
  });

  it('registry contains the expected core routes', () => {
    const urls = app.routeRegistry.map((r) => `${r.method} ${r.url}`);
    expect(urls).toContain('POST /auth/login');
    expect(urls).toContain('GET /v1/branches');
    expect(urls).toContain('GET /health');
  });
});
