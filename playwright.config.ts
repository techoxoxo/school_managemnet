import { defineConfig } from '@playwright/test';

/**
 * P1-QA-01: Phase-1 exit-gate E2E. API-level (uses the `request` fixture — no
 * browser needed) so it exercises the real Fastify stack end-to-end without
 * depending on UI pages that are still being built. Auto-starts the API and
 * reuses one that's already running.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: API_URL, extraHTTPHeaders: { 'content-type': 'application/json' } },
  webServer: {
    command: 'npx tsx apps/api/src/index.ts',
    url: `${API_URL}/health`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      NODE_ENV: 'development',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgres://schoolmate:schoolmate_dev@localhost:5432/schoolmate',
      DATABASE_APP_URL:
        process.env.DATABASE_APP_URL ??
        'postgres://schoolmate_app:schoolmate_app_dev@localhost:5432/schoolmate',
    },
  },
});
