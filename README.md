# Schoolmate

Multi-tenant SaaS platform for schools, coaching centers, colleges, and every kind of educational institute.

## Documents

- [SCHOOLMATE_PLAN.md](./SCHOOLMATE_PLAN.md) — full product & architecture plan
- [SCHOOLMATE_DEV_TASKS.md](./SCHOOLMATE_DEV_TASKS.md) — phase-wise engineering task tracker
- [SCHOOLMATE_UX_PAGES_TASKS.md](./SCHOOLMATE_UX_PAGES_TASKS.md) — page-level & role-level UX quality tracker

## Structure

```
apps/
  api/          Fastify backend (port 4000)
  web/          Next.js tenant app (port 3000)
  admin-panel/  Next.js super-admin panel (port 3001)
  worker/       Background job processor
packages/
  shared/       Shared types, error codes, env validation
```

## Getting started

```bash
# 1. Infrastructure (Postgres, Redis, MinIO, Meilisearch, Mailpit)
docker compose up -d

# 2. Install
npm install

# 3. Environment
cp .env.example .env

# 4. Develop (all apps via Turborepo)
npm run dev
```

## Commands

| Command             | Does                     |
| ------------------- | ------------------------ |
| `npm run dev`       | Run all apps in dev mode |
| `npm run build`     | Build all workspaces     |
| `npm run lint`      | ESLint across workspaces |
| `npm run typecheck` | TypeScript checks        |
| `npm run test`      | Run tests                |

Node >= 22 · npm workspaces · Turborepo
