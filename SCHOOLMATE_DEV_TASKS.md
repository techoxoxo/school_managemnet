# Schoolmate — Development Task Tracker

> Companion to [SCHOOLMATE_PLAN.md](./SCHOOLMATE_PLAN.md). Every task maps to a plan section.
> Update the **Status** column as work progresses. Keep this file as the single source of truth for "what's done".

## How to Use This File

### Status Legend

| Status       | Meaning                                       |
| ------------ | --------------------------------------------- |
| ⬜ `TODO`    | Not started                                   |
| 🟨 `WIP`     | In progress                                   |
| 🟦 `REVIEW`  | Code complete, in review/testing              |
| ✅ `DONE`    | Merged, tested, deployed to dev               |
| ⛔ `BLOCKED` | Waiting on dependency (note blocker in Notes) |
| 🔁 `ONGOING` | Continuous task, never "done"                 |

### Task ID Convention

`<Phase>-<Track>-<Number>` — e.g., `P0-INF-03` = Phase 0, Infrastructure track, task 3.

Tracks: `INF` infrastructure · `DB` database · `API` backend · `WEB` frontend · `AUTH` auth/security · `MOD` module · `QA` testing · `OPS` devops · `BIZ` business/platform · `MOB` mobile · `AI` ai/automation

### Definition of Done (applies to every module task)

- [ ] Unit + integration tests written and passing
- [ ] RLS cross-tenant leak test for every new table
- [ ] Permission matrix entries declared for every new endpoint
- [ ] Audit logging on all writes
- [ ] Zod validation on client and server
- [ ] Mobile-responsive UI verified
- [ ] i18n keys extracted (no hardcoded strings)
- [ ] API documented in OpenAPI spec

---

## Progress Summary

| Phase         | Scope                                      | Tasks | Done | Status  |
| ------------- | ------------------------------------------ | ----- | ---- | ------- |
| Phase 0       | Foundation & scaffolding                   | 28    | 27   | ✅ (G1) |
| Phase 1       | Core academic MVP                          | 33    | 33   | ✅ (G2) |
| Phase 2       | Fees & examinations                        | 30    | 16   | 🟨      |
| Phase 3       | Operations (timetable, HR, library, comms) | 28    | 0    | ⬜      |
| Phase 4       | Extended modules & portals                 | 26    | 0    | ⬜      |
| Phase 5       | Advanced & polish                          | 22    | 0    | ⬜      |
| Phase 6       | Scale, harden & launch                     | 20    | 0    | ⬜      |
| Phase 7       | Pro level: verticals, mobile, AI, platform | 42    | 0    | ⬜      |
| Cross-cutting | Continuous tracks                          | 12    | —    | 🔁      |

---

# PHASE 0 — Foundation (Weeks 1–3)

**Goal**: A running monorepo where a request can flow browser → Next.js → Fastify → Postgres (tenant-scoped) → back, with auth, CI, and one seeded tenant.
**Exit gate**: `docker compose up` gives a working login for a seeded tenant admin; CI green on lint/test/build.

## 0.1 Repository & Tooling

| ID        | Task                                                                                              | Depends on | Status | Notes                                        |
| --------- | ------------------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------- |
| P0-INF-01 | Init Turborepo monorepo (`apps/api`, `apps/web`, `apps/worker`, `apps/admin-panel`, `packages/*`) | —          | ✅     | npm workspaces (not pnpm); build 13/13 green |
| P0-INF-02 | Base tooling: TypeScript strict, ESLint, Prettier, Husky pre-commit, commitlint                   | P0-INF-01  | ✅     | commitlint deferred; husky+lint-staged in    |
| P0-INF-03 | `packages/shared` — shared types, constants, error codes                                          | P0-INF-01  | ✅     | errors, envelope, roles, env + tests         |
| P0-INF-04 | Docker Compose: Postgres 16, Redis 7, MinIO, Meilisearch, mailpit (dev SMTP)                      | —          | ✅     |                                              |
| P0-INF-05 | Environment config system (typed env validation with Zod, `.env.example`)                         | P0-INF-03  | ✅     | `parseEnv()` in shared                       |
| P0-INF-06 | GitHub Actions CI: lint + typecheck + test + build on every PR                                    | P0-INF-02  | ✅     | `.github/workflows/ci.yml`                   |

## 0.2 Database Layer

| ID       | Task                                                                                                     | Depends on | Status | Notes                                                                |
| -------- | -------------------------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------- |
| P0-DB-01 | `packages/db` — Drizzle ORM setup, migration tooling, migration CI check                                 | P0-INF-04  | ✅     | drizzle-kit generates from dist (NodeNext quirk)                     |
| P0-DB-02 | Core schema migration: `tenants`, `tenant_billing`, `branches`, `academic_sessions`                      | P0-DB-01   | ✅     | Plan §4.A — migrations/0000_core-schema.sql                          |
| P0-DB-03 | Users schema: `users`, `user_tenant_roles`, `custom_roles`, `permissions_catalog`                        | P0-DB-01   | ✅     | Plan §4.B — + institute_type on tenants                              |
| P0-DB-04 | Audit schema: `audit_logs`, `login_history`                                                              | P0-DB-01   | ✅     | Plan §4.S                                                            |
| P0-DB-05 | RLS policies: enable per-table, `tenant_id = current_setting('app.tenant_id')` pattern                   | P0-DB-02   | ✅     | Critical path — 0001: FORCE RLS + NULLIF guard + schoolmate_app role |
| P0-DB-06 | RLS leak-test harness: create 2 tenants, assert zero cross-tenant reads (reusable for all future tables) | P0-DB-05   | ✅     | Plan §22 — 6/6 passing; runs in CI vs live PG                        |
| P0-DB-07 | Seed script: demo tenant + branch + session + admin user (faker-based factory foundation)                | P0-DB-03   | ✅     | springfield / admin@springfield.test                                 |

## 0.3 Backend Core

| ID        | Task                                                                                 | Depends on          | Status | Notes                                                               |
| --------- | ------------------------------------------------------------------------------------ | ------------------- | ------ | ------------------------------------------------------------------- |
| P0-API-01 | Fastify server: plugin architecture, graceful shutdown, Pino logging with request_id | P0-INF-05           | ✅     | plugins: redis, db, tenant, swagger, rate-limit                     |
| P0-API-02 | Global error handler + standard response/error envelope (Plan §7 conventions)        | P0-API-01           | ✅     | AppError + Zod + fastify errors → envelope                          |
| P0-API-03 | Tenant resolution middleware: subdomain/header → Redis cache → DB → request context  | P0-DB-02            | ✅     | Plan §3 — header/subdomain → Redis (1h TTL) → DB; suspended blocked |
| P0-API-04 | DB plugin: per-request transaction with tenant GUC set (RLS enforcement point)       | P0-API-03, P0-DB-05 | ✅     | request.tenantDb() → withTenant()                                   |
| P0-API-05 | OpenAPI/Swagger auto-generation from Fastify schemas                                 | P0-API-02           | ✅     | fastify-type-provider-zod → /docs                                   |
| P0-API-06 | Rate limiting plugin (Redis-backed, per-user + per-tenant)                           | P0-API-01           | ✅     | Redis store, tenant+IP key (user key after AUTH)                    |
| P0-API-07 | Health/readiness endpoints (`/health`, `/ready` — DB, Redis checks)                  | P0-API-01           | ✅     | /ready checks PG+Redis                                              |

## 0.4 Authentication & Authorization

| ID         | Task                                                                                                  | Depends on | Status | Notes                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------ |
| P0-AUTH-01 | Login: email/phone + password, bcrypt/argon2, JWT access (15m) + refresh (7d, Redis, rotated)         | P0-DB-03   | ✅     | bcrypt + JWT 15m + Redis sessions 7d                               |
| P0-AUTH-02 | Refresh flow, logout, force-logout (admin kills sessions)                                             | P0-AUTH-01 | ✅     | rotation w/ reuse-theft detection; instant revocation via Redis    |
| P0-AUTH-03 | Brute-force protection: lockout after 5 fails, CAPTCHA after 3, rate limit                            | P0-AUTH-01 | ✅     | 5 fails→30min lock; CAPTCHA deferred to web UI (P0-WEB-02)         |
| P0-AUTH-04 | Forgot/reset password + email verification flow                                                       | P0-AUTH-01 | ✅     | reset kills all sessions; email dispatch → P1-API-02               |
| P0-AUTH-05 | RBAC engine: role → permissions resolution, `hasPermission()` guard, per-route permission declaration | P0-DB-03   | ✅     | Plan §5 — route config.permission + global guard + shared role map |
| P0-AUTH-06 | ABAC layer: scope filters (own-branch, own-children, own-classes) as query decorators                 | P0-AUTH-05 | ✅     | AuthContext + assertBranchScope; deepens per module                |
| P0-AUTH-07 | Permission-matrix test generator: endpoint × role → allow/deny, CI-enforced                           | P0-AUTH-05 | ✅     | Plan §22 — permission-matrix.test.ts — undeclared route fails CI   |
| P0-AUTH-08 | MFA (TOTP) — optional per user, enforceable per tenant                                                | P0-AUTH-01 | ⛔     | Can slip to P5 — deferred to Phase 5 per plan note (needs web UI)  |

## 0.5 Frontend Foundation

| ID        | Task                                                                                            | Depends on | Status | Notes                                                                           |
| --------- | ----------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------- |
| P0-WEB-01 | Next.js App Router setup: route groups per Plan §8, Tailwind + shadcn/ui                        | P0-INF-01  | ✅     | Tailwind v4 tokens, shadcn-style Button/Input/Card kit                          |
| P0-WEB-02 | Auth pages: login, forgot password, OTP verify; session handling (httpOnly cookies)             | P0-AUTH-01 | ✅     | BFF login/refresh/logout → httpOnly cookies; no-enumeration errors              |
| P0-WEB-03 | Tenant-aware middleware: subdomain routing, tenant theming (logo/colors from config)            | P0-API-03  | ✅     | middleware: subdomain→cookie tenant + auth-guard redirects                      |
| P0-WEB-04 | App shell: sidebar nav (permission-filtered), topbar, breadcrumbs, role switcher                | P0-WEB-02  | ✅     | AppShell: permission-filtered sidebar, topbar, mobile drawer                    |
| P0-WEB-05 | Data layer: TanStack Query setup, typed API client generated from OpenAPI                       | P0-API-05  | ✅     | server apiFetch forwards cookie Bearer + tenant slug                            |
| P0-WEB-06 | Core UI kit: DataTable (TanStack), FormBuilder (RHF+Zod), ConfirmDialog, EmptyState, PageHeader | P0-WEB-01  | ✅     | Reused by every module — Button/Input/Card/EmptyState/Skeleton/Alert/PageHeader |

---

# PHASE 1 — Core Academic MVP (Weeks 4–8)

**Goal**: A school can onboard, set up structure, admit students, link parents, and mark attendance.
**Exit gate**: Full demo flow — onboard tenant → create class → admit student → mark attendance → parent gets absent SMS (dev SMTP/log).

## 1.1 Tenant Onboarding & Structure

| ID        | Task                                                                                          | Depends on | Status | Notes                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| P1-MOD-01 | Super-admin panel skeleton (`apps/admin-panel`): tenant list, create tenant                   | P0-WEB-06  | ✅     | Plan §6 M1 — platform auth (is_platform_admin, role-gated /platform routes) + tenant list/create API + admin-panel UI; verified live       |
| P1-MOD-02 | Tenant onboarding wizard: institute-type preset selection → auto-scaffold classes/terminology | P1-MOD-01  | ✅     | Plan §15 — POST /platform/tenants/:id/onboard scaffolds branch+session+class ladder from preset; admin-panel onboard action; verified live |
| P1-MOD-03 | Institute profile config engine: enabled modules, terminology packs, feature flags per tenant | P1-MOD-02  | ✅     | Plan §15 — INSTITUTE_PRESETS + PATCH /platform/tenants/:id/config (merge) + tenant GET /v1/config; admin-panel config view                 |
| P1-MOD-04 | Branch management CRUD + branch-scoped config overrides                                       | P1-MOD-02  | ✅     | full CRUD via registerCrud factory + audit + branch config                                                                                 |
| P1-MOD-05 | Academic session management: create, set current, lock past sessions                          | P1-MOD-04  | ✅     | sessions CRUD, branchId filter, isCurrent/isLocked                                                                                         |
| P1-MOD-06 | Classes & sections CRUD: DB (§4.F) + API + UI, class-teacher assignment                       | P1-MOD-05  | ✅     | classes+sections CRUD, unique constraints→409, branch/class filters                                                                        |
| P1-MOD-07 | Subjects CRUD + class-subject mapping + subject-teacher assignment                            | P1-MOD-06  | ✅     | subjects CRUD + class_subjects mapping + subject_teachers assign (joined listings, audit, RLS)                                             |

## 1.2 Students, Admissions & Parents

| ID        | Task                                                                                                                         | Depends on            | Status | Notes                                                                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-MOD-08 | Students schema migration (§4.C: students, documents, class_history, admissions)                                             | P0-DB-05              | ✅     | students, parents, parent_student schema + FORCE RLS (0004/0005)                                                                                                                                          |
| P1-MOD-09 | Student CRUD: profile, photo upload (MinIO/S3), admission number generator                                                   | P1-MOD-08, P1-MOD-06  | ✅     | student CRUD, admission# unique→409, branch/class/section/status filters                                                                                                                                  |
| P1-MOD-10 | Student documents: upload, checklist, verification workflow                                                                  | P1-MOD-09             | ✅     | student_documents (S3/MinIO), presigned PUT/GET, required-docs checklist, verify/reject workflow, delete + web student-detail page with upload widget; verified live (browser→MinIO upload, verify)       |
| P1-MOD-11 | Field-level encryption service (AES-256-GCM, per-tenant keys) — apply to Aadhaar/bank fields                                 | P1-MOD-08             | ✅     | Plan §13 — AES-256-GCM per-tenant (HKDF) field encryption; masked without view_sensitive                                                                                                                  |
| P1-MOD-12 | Admission pipeline: application form, status workflow (applied→…→accepted), convert-to-student                               | P1-MOD-09             | ✅     | admissions table+RLS; CRUD + guarded status transitions + convert→student (emits student.admitted)                                                                                                        |
| P1-MOD-13 | Parents schema + CRUD + parent-student linking (M2M, primary contact, pickup rights)                                         | P1-MOD-09             | ✅     | parents CRUD + parent-student M2M linking with join listing                                                                                                                                               |
| P1-MOD-14 | Parent account auto-provisioning: magic-link invite via SMS/email (no password setup)                                        | P1-MOD-13, P0-AUTH-01 | ✅     | Plan §19 — /parents/:id/invite (provision+token+parent.invited event) → /auth/accept-invite passwordless login                                                                                            |
| P1-MOD-15 | Sibling detection & linking                                                                                                  | P1-MOD-13             | ✅     | Feeds fee discounts in P2 — sibling detection via shared parents                                                                                                                                          |
| P1-MOD-16 | Bulk import v1: Excel template for students+parents, column mapper, dry-run validation, staged commit, rollback by batch tag | P1-MOD-09             | ✅     | Plan §19 — import_batches + /imports/students (dry-run, all-or-nothing commit, rollback-by-batch, +parent link) + web /import wizard (CSV paste, column mapper, dry-run preview, rollback); verified live |
| P1-MOD-17 | Student search: Meilisearch indexing + advanced filters UI                                                                   | P1-MOD-09             | ✅     | Meili index (tenant-filtered) + best-effort sync on CRUD + GET /students/search (typo-tolerant, class/section/status filters) + /reindex; web Students page with search; CI Meili service; verified live  |

## 1.3 Staff Basics

| ID        | Task                                                                   | Depends on            | Status | Notes                                                                                                                                     |
| --------- | ---------------------------------------------------------------------- | --------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| P1-MOD-18 | Staff schema (§4.E core: staff_members) + CRUD + employee ID generator | P0-DB-05              | ✅     | staff_members + staff_attendance + departments schema; staff CRUD, employee# unique→409                                                   |
| P1-MOD-19 | Staff user account creation + role assignment UI                       | P1-MOD-18, P0-AUTH-05 | ✅     | API (/staff/:id/account + /roles) + web Staff page: add staff, create login (email+role), account status; authed BFF proxy; verified live |
| P1-MOD-20 | Departments & designations                                             | P1-MOD-18             | ✅     | departments CRUD (factory)                                                                                                                |
| P1-MOD-21 | Staff bulk import (reuses P1-MOD-16 framework)                         | P1-MOD-16, P1-MOD-18  | ✅     | /imports/staff (dry-run, commit, rollback via shared framework); staff_members.import_batch_id; Staff tab in the /import wizard           |

## 1.4 Attendance

| ID        | Task                                                                              | Depends on | Status | Notes                                                                                                     |
| --------- | --------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------- |
| P1-MOD-22 | Attendance schema (§4.H) + settings (daily vs period-wise per tenant)             | P0-DB-05   | ✅     | student_attendance + attendance_settings schema; per-branch settings get/patch                            |
| P1-MOD-23 | Mark attendance UI: whole-class single screen, keyboard-fast, defaults to present | P1-MOD-22  | ✅     | Teacher's daily tool — UX matters most here — bulk mark (upsert/idempotent), source tracking, marked_by   |
| P1-MOD-24 | Period-wise attendance mode                                                       | P1-MOD-23  | ✅     | mark-periods (periodWise jsonb, dup-period 400, day-status rollup, upsert) + period register              |
| P1-MOD-25 | Attendance reports: daily register, monthly summary, student %                    | P1-MOD-23  | ✅     | daily register + student % report (present+late+½·half_day)                                               |
| P1-MOD-26 | Unmarked-class detection + teacher reminder                                       | P1-MOD-23  | ✅     | /attendance/unmarked (unmarked/partial per section vs enrolled) + /remind-unmarked → class-teacher event  |
| P1-MOD-27 | Staff attendance: manual marking + self check-in                                  | P1-MOD-18  | ✅     | admin bulk-mark (upsert/idempotent) + self check-in/out (own record via userId) + daily register + report |

## 1.5 Events, Notifications & Dashboards (v1)

| ID        | Task                                                                                                                         | Depends on           | Status | Notes                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-API-01 | Transactional outbox: outbox table, poller worker, Redis Streams dispatch                                                    | P0-DB-01             | ✅     | Plan §17 — build EARLY, everything hangs off it — outbox_events + emitEvent(); atomic w/ tx (rollback drops, commit persists); relay drains+publishes             |
| P1-API-02 | Notification engine v1: queue table, channel abstraction (email via SMTP, SMS via provider abstraction, in-app), retry logic | P1-API-01            | ✅     | dispatch registry, in-app+queue, email(nodemailer)/sms/push senders, prefs opt-out, retry→fail                                                                    |
| P1-API-03 | Event: `attendance.absent` → parent notification (configurable)                                                              | P1-API-02, P1-MOD-23 | ✅     | First end-to-end event flow — absent→attendance.absent event w/ parent recipients; PROVEN LIVE (api→worker→SMS)                                                   |
| P1-WEB-01 | Admin dashboard v1: student count, attendance today, recent activity                                                         | P1-MOD-23            | ✅     | adaptive /dashboard: student/staff/admission counts + attendance-today, backed by GET /v1/dashboard/summary                                                       |
| P1-WEB-02 | Teacher dashboard v1: my classes, mark attendance shortcut, my timetable placeholder                                         | P1-MOD-23            | ✅     | same dashboard shows my-classes + mark-attendance shortcut + timetable placeholder when caller has a staff record; /attendance landing page                       |
| P1-QA-01  | E2E: onboard → class → admit student → mark attendance → absent notification (Playwright)                                    | all above            | ✅     | API-level Playwright golden-path spec (login→class→section→admit→link parent→mark absent→notified:1); webServer auto-starts API; CI seed+e2e steps; green locally |

---

# PHASE 2 — Fees & Examinations (Weeks 9–13)

**Goal**: Money in, marks out — the two workflows schools evaluate first.
**Exit gate**: Collect a fee (cash + online sandbox) → PDF receipt; enter marks → publish → parent sees report card PDF.

## 2.1 Fee Management

| ID        | Task                                                                                                           | Depends on           | Status | Notes                                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------- | -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-MOD-01 | Fee schema (§4.I): structures, allocations, discounts, payments, reminders, custom plans                       | P0-DB-05             | ✅     | fee_structures/items, fee_dues, fee_payments (receipt# unique), fee_discounts; all minor-units bigint; FORCE RLS + leak test                                                                                                                             |
| P2-MOD-02 | Money math package: minor units only, allocation, proration, late-fee rules — near-100% unit coverage          | P2-MOD-01            | ✅     | Plan §25 risk #3 — audit-grade                                                                                                                                                                                                                           |
| P2-MOD-03 | Fee structure builder UI: heads, frequencies, installment plans, late-fee config                               | P2-MOD-02            | 🟨     | API done: `/fee-structures` CRUD + items (fees.test.ts). Web builder UI pending.                                                                                                                                                                         |
| P2-MOD-04 | Fee allocation: auto-assign by class, mid-year pro-ration for new admissions                                   | P2-MOD-03            | ✅     | Plan §9 edge cases                                                                                                                                                                                                                                       |
| P2-MOD-05 | Discounts & concessions: sibling auto-apply, merit, staff-ward, approval workflow                              | P2-MOD-04, P1-MOD-15 | ✅     |                                                                                                                                                                                                                                                          |
| P2-MOD-06 | Fee collection desk UI: search student → outstanding view → collect (cash/cheque/UPI ref) → receipt            | P2-MOD-04            | 🟨     | Accountant's daily tool. API done: outstanding view + FIFO collect + receipt# (fees.test.ts). Web desk UI pending.                                                                                                                                       |
| P2-MOD-07 | Receipt PDF: numbered sequence per tenant, template, reprint with audit log                                    | P2-MOD-06            | ✅     | `GET /v1/payments/:id/receipt.pdf` → A4 PDF (lib/receipt-template.ts) with per-tenant `R-YYYY-NNNNNN` numbering + fee-head breakdown. Reprints flagged via prior `export` audit; each generation writes an audit log. Test asserts %PDF + double-export. |
| P2-MOD-08 | Payment gateway integration (Razorpay first): order creation, webhook handler (idempotent), reconciliation job | P2-MOD-06            | ⬜     |                                                                                                                                                                                                                                                          |
| P2-MOD-09 | Edge cases: partial payment, advance payment, cheque bounce reversal, refund workflow                          | P2-MOD-06            | ✅     | Plan §9 fee table                                                                                                                                                                                                                                        |
| P2-MOD-10 | Defaulter reports + automated reminder scheduling (event-driven via outbox)                                    | P2-MOD-08, P1-API-02 | ✅     |                                                                                                                                                                                                                                                          |
| P2-MOD-11 | Fee reports: daily collection, head-wise, outstanding, collection efficiency                                   | P2-MOD-06            | ✅     |                                                                                                                                                                                                                                                          |

## 2.2 Examinations & Results

| ID        | Task                                                                                                     | Depends on            | Status | Notes                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------- | --------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-MOD-12 | Exam schema (§4.J): exam_types, exams, results, grading_systems, report_cards                            | P0-DB-05              | ✅     | exam_types, grading_systems, exams, exam_subjects (datesheet), exam_results, report_cards; FORCE RLS + leak test                                                                                                                         |
| P2-MOD-13 | Grading system config: CBSE/ICSE/percentage/GPA presets + custom scale builder                           | P2-MOD-12             | ✅     |                                                                                                                                                                                                                                          |
| P2-MOD-14 | Exam scheduling: create exams, datesheet, conflict detection                                             | P2-MOD-12, P1-MOD-07  | ✅     |                                                                                                                                                                                                                                          |
| P2-MOD-15 | Marks entry UI: spreadsheet-style grid, teacher-scoped (own subjects only via ABAC), absent/exempt flags | P2-MOD-14, P0-AUTH-06 | 🟨     | API done: `/exam-subjects/:id/marks` with teacher ABAC (subject_teachers), absent/exempt, auto-grade (exams.test.ts). Web grid UI pending.                                                                                               |
| P2-MOD-16 | Marks verification workflow: entered → verified → locked                                                 | P2-MOD-15             | ✅     |                                                                                                                                                                                                                                          |
| P2-MOD-17 | Grade calculation + rank generation (class/section)                                                      | P2-MOD-16, P2-MOD-13  | ✅     |                                                                                                                                                                                                                                          |
| P2-MOD-18 | Report card engine: data assembly → React template → Puppeteer PDF (Plan §14 pipeline)                   | P2-MOD-17             | ✅     | `htmlToPdf` (puppeteer-core → system Chrome) in lib/pdf.ts; `GET /v1/exams/:id/students/:studentId/report-card.pdf` assembles card+subjects+grades → A4 PDF. Test skips when Chrome absent.                                              |
| P2-MOD-19 | Report card templates: CBSE + generic formats, tenant template config (JSONB layout)                     | P2-MOD-18             | ✅     | Generic + CBSE templates (lib/report-card-template.ts, HTML-escaped). Selection: `?template=` override → tenant `config.reportCardTemplate` (JSONB, exposed on request.tenant) → generic default. Both variants render in exams.test.ts. |
| P2-MOD-20 | Bulk report generation: Bull queue worker, S3 caching, batch notify                                      | P2-MOD-18             | ⬜     |                                                                                                                                                                                                                                          |
| P2-MOD-21 | Result publishing: controlled release, pre-generation + cache warming before publish                     | P2-MOD-20             | 🟨     | Plan §20 result-day spike. Controlled release done + tested (publish/unpublish; hidden until published; refuses uncomputed → 409). Pre-generation + cache warming deferred.                                                              |
| P2-MOD-22 | Academic analytics: subject-wise averages, pass %, distribution charts                                   | P2-MOD-17             | ✅     |                                                                                                                                                                                                                                          |
| P2-QA-01  | E2E: fee collect (cash + gateway sandbox) + marks → publish → report card PDF                            | all above             | ⬜     | Phase exit gate                                                                                                                                                                                                                          |

---

# PHASE 3 — Operations (Weeks 14–18)

**Goal**: Timetable, HR/payroll, library, syllabus, communication — the daily-operations layer.
**Exit gate**: A school can run a full normal week in Schoolmate without leaving the app.

## 3.1 Timetable

| ID        | Task                                                                                                      | Depends on           | Status | Notes |
| --------- | --------------------------------------------------------------------------------------------------------- | -------------------- | ------ | ----- |
| P3-MOD-01 | Timetable schema (§4.G): period templates, entries, substitutions                                         | P1-MOD-07            | ⬜     |       |
| P3-MOD-02 | Period template builder (timings, breaks, day variants)                                                   | P3-MOD-01            | ⬜     |       |
| P3-MOD-03 | Manual timetable builder: drag-drop grid (dnd-kit), live conflict detection (teacher/room double-booking) | P3-MOD-02            | ⬜     |       |
| P3-MOD-04 | Views: class timetable, teacher timetable, room usage; PDF export                                         | P3-MOD-03            | ⬜     |       |
| P3-MOD-05 | Substitution management: absent teacher → suggest free teachers → assign → notify                         | P3-MOD-04, P1-API-02 | ⬜     |       |

## 3.2 Staff HR & Payroll

| ID        | Task                                                                                                       | Depends on           | Status | Notes                |
| --------- | ---------------------------------------------------------------------------------------------------------- | -------------------- | ------ | -------------------- |
| P3-MOD-06 | Leave schema + leave types config (allowances, carry-forward, document rules)                              | P1-MOD-18            | ⬜     |                      |
| P3-MOD-07 | Leave workflow: apply → approve/reject → balance tracking → leave calendar                                 | P3-MOD-06            | ⬜     |                      |
| P3-MOD-08 | Payroll: monthly generation (allowances/deductions JSONB, leave deduction), approval, payslip PDF          | P3-MOD-06, P2-MOD-02 | ⬜     | Reuses money package |
| P3-MOD-09 | Payroll edge cases: mid-month joiner/leaver pro-ration, held salary, hourly/per-lecture (visiting faculty) | P3-MOD-08            | ⬜     |                      |

## 3.3 Library

| ID        | Task                                                                          | Depends on | Status | Notes |
| --------- | ----------------------------------------------------------------------------- | ---------- | ------ | ----- |
| P3-MOD-10 | Library schema (§4.L) + settings (limits, durations, fines)                   | P0-DB-05   | ⬜     |       |
| P3-MOD-11 | Catalog: CRUD, ISBN lookup autofill, barcode generation, Meilisearch indexing | P3-MOD-10  | ⬜     |       |
| P3-MOD-12 | Issue/return desk: barcode scan flow, fine auto-calc, renewals, reservations  | P3-MOD-11  | ⬜     |       |
| P3-MOD-13 | Library reports: overdue, most-issued, stock audit workflow                   | P3-MOD-12  | ⬜     |       |

## 3.4 Syllabus, Lesson Plans & Assignments

| ID        | Task                                                                             | Depends on | Status | Notes |
| --------- | -------------------------------------------------------------------------------- | ---------- | ------ | ----- |
| P3-MOD-14 | Syllabus schema (§4.K) + chapter/topic builder + completion tracking             | P1-MOD-07  | ⬜     |       |
| P3-MOD-15 | Lesson plans: create, HOD review/approve, planned-vs-actual tracking             | P3-MOD-14  | ⬜     |       |
| P3-MOD-16 | Assignments: create, attach files, student online submission, grading + feedback | P3-MOD-14  | ⬜     |       |

## 3.5 Communication & Calendar

| ID        | Task                                                                                                   | Depends on           | Status | Notes           |
| --------- | ------------------------------------------------------------------------------------------------------ | -------------------- | ------ | --------------- |
| P3-MOD-17 | Announcements & notices: audience targeting (roles/classes/sections), acknowledgment tracking, pinning | P1-API-02            | ⬜     |                 |
| P3-MOD-18 | In-app messaging: teacher↔parent, admin↔staff, threading, attachments                                  | P0-DB-05             | ⬜     |                 |
| P3-MOD-19 | SMS provider integration (MSG91) + per-tenant credit wallet + low-balance alerts                       | P1-API-02            | ⬜     | Plan §16        |
| P3-MOD-20 | Real-time layer: Socket.IO plugin, in-app notification bell, live updates                              | P1-API-02            | ⬜     |                 |
| P3-MOD-21 | Holidays & academic calendar: CRUD, holiday types, calendar view (FullCalendar)                        | P1-MOD-05            | ⬜     |                 |
| P3-MOD-22 | Events: create, registrations, budget tracking; PTM slot booking                                       | P3-MOD-21            | ⬜     |                 |
| P3-MOD-23 | Sudden-holiday flow: bulk attendance override + mass notification                                      | P3-MOD-21, P1-MOD-23 | ⬜     | Plan §9         |
| P3-QA-01  | E2E: full week simulation — timetable, substitution, leave, library issue, announcement                | all above            | ⬜     | Phase exit gate |

---

# PHASE 4 — Extended Modules & Portals (Weeks 19–23)

**Goal**: Hostel, transport, portals, and the remaining operational modules.
**Exit gate**: Parent and student portals fully usable; hostel/transport schools supported.

## 4.1 Hostel & Transport

| ID        | Task                                                                         | Depends on           | Status | Notes              |
| --------- | ---------------------------------------------------------------------------- | -------------------- | ------ | ------------------ |
| P4-MOD-01 | Hostel schema (§4.M) + room setup + occupancy dashboard                      | P0-DB-05             | ⬜     |                    |
| P4-MOD-02 | Room allocation, check-in/out, room change, mess menu                        | P4-MOD-01            | ⬜     |                    |
| P4-MOD-03 | Hostel visitor log + student outing requests + parent notification           | P4-MOD-02, P1-API-02 | ⬜     |                    |
| P4-MOD-04 | Hostel fee integration (charges flow into fee module)                        | P4-MOD-02, P2-MOD-04 | ⬜     |                    |
| P4-MOD-05 | Transport schema (§4.N): vehicles, routes, stops, student mapping            | P0-DB-05             | ⬜     |                    |
| P4-MOD-06 | Route builder + student-stop assignment + transport fee integration          | P4-MOD-05, P2-MOD-04 | ⬜     |                    |
| P4-MOD-07 | Vehicle document expiry alerts (insurance/fitness/permit)                    | P4-MOD-05, P1-API-02 | ⬜     |                    |
| P4-MOD-08 | GPS ingestion API + live map view (Mapbox) + geofenced arrival notifications | P4-MOD-06            | ⬜     | Device integration |

## 4.2 Parent & Student Portals

| ID        | Task                                                                                     | Depends on           | Status | Notes                          |
| --------- | ---------------------------------------------------------------------------------------- | -------------------- | ------ | ------------------------------ |
| P4-WEB-01 | Parent portal shell: multi-child switcher, dashboard (attendance/fees/exams at a glance) | P1-MOD-14            | ⬜     | Plan §6 M19                    |
| P4-WEB-02 | Parent: attendance view, results & report card download, timetable, homework status      | P4-WEB-01            | ⬜     |                                |
| P4-WEB-03 | Parent: online fee payment flow + receipt history                                        | P4-WEB-01, P2-MOD-08 | ⬜     | Highest-traffic parent feature |
| P4-WEB-04 | Parent: messaging, notices, leave application for child, PTM booking                     | P4-WEB-01, P3-MOD-18 | ⬜     |                                |
| P4-WEB-05 | Parent: bus tracking view                                                                | P4-WEB-01, P4-MOD-08 | ⬜     |                                |
| P4-WEB-06 | Student portal: dashboard, timetable, homework submission, results, library, notices     | P1-MOD-09            | ⬜     | Plan §6 M20                    |
| P4-WEB-07 | Notification preferences UI (per-channel, per-event)                                     | P4-WEB-01            | ⬜     |                                |

## 4.3 Remaining Operational Modules

| ID        | Task                                                                                                      | Depends on           | Status | Notes                       |
| --------- | --------------------------------------------------------------------------------------------------------- | -------------------- | ------ | --------------------------- |
| P4-MOD-09 | Inventory & assets (§4.Q): catalog, stock transactions, low-stock alerts, asset tags                      | P0-DB-05             | ⬜     |                             |
| P4-MOD-10 | Visitor management (§4.R): check-in/out, badges, pre-approval, blacklist                                  | P0-DB-05             | ⬜     |                             |
| P4-MOD-11 | Certificate engine: bonafide/character/TC templates, bulk generation, QR verification endpoint            | P2-MOD-18            | ⬜     | Reuses PDF pipeline         |
| P4-MOD-12 | ID card generation: student/staff, QR/barcode, bulk print layout                                          | P4-MOD-11            | ⬜     |                             |
| P4-MOD-13 | Complaints/tickets: categories, assignment, escalation SLA, anonymous option                              | P0-DB-05             | ⬜     |                             |
| P4-MOD-14 | Student promotion wizard: session rollover, bulk promote/detain, fee-clearance check (configurable block) | P1-MOD-09, P2-MOD-04 | ⬜     | Plan §9 — year-end critical |
| P4-MOD-15 | Transfer workflow: TC generation, inter-branch transfer with history carry-forward                        | P4-MOD-11            | ⬜     |                             |
| P4-MOD-16 | Push notifications: FCM web-push integration into notification engine                                     | P1-API-02            | ⬜     |                             |
| P4-QA-01  | E2E: parent journey (login → view child → pay fee → download report card)                                 | P4-WEB-03            | ⬜     | Phase exit gate             |

---

# PHASE 5 — Advanced & Polish (Weeks 24–28)

**Goal**: Differentiators, hardening, and the polish that closes deals.
**Exit gate**: Security audit passed; PWA works offline; custom reports shippable.

| ID        | Task                                                                                                 | Depends on | Status | Notes                  |
| --------- | ---------------------------------------------------------------------------------------------------- | ---------- | ------ | ---------------------- |
| P5-MOD-01 | Custom report builder: source picker, drag-drop columns, filters, grouping, save/schedule/export     | P2-MOD-11  | ⬜     | Plan §14               |
| P5-MOD-02 | Government reports: UDISE+ format, RTE compliance exports                                            | P5-MOD-01  | ⬜     | India compliance       |
| P5-MOD-03 | Advanced analytics dashboards: configurable widgets, trends, branch comparison                       | P5-MOD-01  | ⬜     |                        |
| P5-MOD-04 | PWA: installable, service worker, offline attendance marking with sync queue + conflict rules        | P1-MOD-23  | ⬜     | Plan §18               |
| P5-MOD-05 | WhatsApp Business API integration (notifications + fee reminders)                                    | P1-API-02  | ⬜     |                        |
| P5-MOD-06 | Online learning module: Zoom/Meet links, recorded lectures, study material, basic quizzes            | P3-MOD-16  | ⬜     | Add-on module          |
| P5-MOD-07 | Custom role builder UI + custom fields framework (dynamic form builder on entities)                  | P0-AUTH-05 | ⬜     | Plan §12 customization |
| P5-MOD-08 | i18n rollout: next-intl, Hindi + English packs, terminology-pack integration                         | P1-MOD-03  | ⬜     |                        |
| P5-MOD-09 | Biometric device integration API (ZKTeco-style sync) + offline device reconciliation                 | P1-MOD-22  | ⬜     |                        |
| P5-MOD-10 | QR attendance: per-day rotating codes, GPS validation                                                | P1-MOD-22  | ⬜     |                        |
| P5-MOD-11 | Tally export + accounting integration                                                                | P2-MOD-11  | ⬜     |                        |
| P5-OPS-01 | Audit trail viewer UI + suspicious-activity alerts (bulk export, off-hours)                          | P0-DB-04   | ⬜     | Plan §13 layer 6       |
| P5-OPS-02 | Data compliance tooling: consent management, data export API (portability), alumni anonymization job | P1-MOD-08  | ⬜     | DPDP/GDPR              |
| P5-OPS-03 | Security audit + external penetration test + fix cycle                                               | all        | ⬜     | Plan §22               |
| P5-OPS-04 | Performance pass: p95 budget enforcement, N+1 sweep, slow-query audit                                | all        | ⬜     |                        |
| P5-QA-01  | Load test suite (k6): result-day, fee-window, attendance-burst scenarios                             | P2-MOD-21  | ⬜     | Plan §20 spikes        |

---

# PHASE 6 — Scale, Harden & Launch (Weeks 29–32)

**Goal**: Production-ready platform, pilot schools live, commercial launch.
**Exit gate**: 3–5 pilot schools running daily operations; production launch checklist signed off.

| ID        | Task                                                                                                     | Depends on  | Status | Notes              |
| --------- | -------------------------------------------------------------------------------------------------------- | ----------- | ------ | ------------------ |
| P6-OPS-01 | Production infra: managed Postgres, PgBouncer, Redis, S3, CDN, WAF (Cloudflare)                          | P5 complete | ⬜     |                    |
| P6-OPS-02 | Backup & DR: automated encrypted backups, PITR, restore drill (documented runbook)                       | P6-OPS-01   | ⬜     | RTO <1h, RPO <5m   |
| P6-OPS-03 | Observability: OpenTelemetry traces, Prometheus/Grafana, Sentry, log aggregation, per-tenant labels      | P6-OPS-01   | ⬜     | Plan §21           |
| P6-OPS-04 | Synthetic probes (login, attendance, fee-pay) + public status page                                       | P6-OPS-03   | ⬜     |                    |
| P6-OPS-05 | Alerting + on-call: severity ladder, PagerDuty/Slack, incident runbooks                                  | P6-OPS-03   | ⬜     |                    |
| P6-OPS-06 | Staging environment + blue-green deploy pipeline + smoke tests                                           | P6-OPS-01   | ⬜     |                    |
| P6-OPS-07 | DB optimization: partitioning live (attendance, audit, notifications), index audit, read replica routing | P6-OPS-01   | ⬜     | Plan §20           |
| P6-BIZ-01 | SaaS billing v1: plans, trial lifecycle, usage snapshots, plan-limit enforcement (soft limits)           | P1-MOD-01   | ⬜     | Plan §16           |
| P6-BIZ-02 | Subscription payments + GST invoices + dunning sequence                                                  | P6-BIZ-01   | ⬜     |                    |
| P6-BIZ-03 | Tenant suspension (read-only mode) + offboarding export + deletion pipeline                              | P6-BIZ-01   | ⬜     | Plan §16           |
| P6-BIZ-04 | Tenant impersonation for support (time-limited, separately audited)                                      | P1-MOD-01   | ⬜     |                    |
| P6-BIZ-05 | Onboarding health score + go-live checklist automation                                                   | P1-MOD-02   | ⬜     | Plan §19           |
| P6-BIZ-06 | In-app guided tours per role + help center + training video embeds                                       | P4-WEB-01   | ⬜     |                    |
| P6-BIZ-07 | Marketing website: landing, pricing, features, demo booking                                              | —           | ⬜     | Can parallel-track |
| P6-QA-01  | Full-platform load test: 1000+ concurrent users/tenant, 50 tenants simulated                             | P6-OPS-07   | ⬜     |                    |
| P6-QA-02  | Pilot program: 3–5 schools, parallel-run month, daily digest, feedback loop                              | everything  | ⬜     |                    |
| P6-QA-03  | Launch checklist: security signoff, DR drill passed, SLO dashboards green, docs complete                 | P6-QA-02    | ⬜     | 🚀                 |

---

# PHASE 7 — Pro Level: Verticals, Mobile, AI & Platform (Post-launch)

**Sequencing rule (from Plan §11)**: nothing here starts until Phases 0–6 have paying tenants. Order within Phase 7 is demand-driven — reorder freely based on signed customers.

## 7.1 Front Office & Enquiry CRM (Plan Module 24)

| ID        | Task                                                          | Depends on | Status | Notes                        |
| --------- | ------------------------------------------------------------- | ---------- | ------ | ---------------------------- |
| P7-MOD-01 | Enquiry schema (§4.T) + lead pipeline UI (kanban by status)   | Launch     | ⬜     | Ship before admission season |
| P7-MOD-02 | Follow-up scheduler, counselor assignment, overdue escalation | P7-MOD-01  | ⬜     |                              |
| P7-MOD-03 | Conversion funnel analytics + source ROI + lost-lead reasons  | P7-MOD-01  | ⬜     |                              |
| P7-MOD-04 | Embeddable website enquiry widget + referral tracking         | P7-MOD-01  | ⬜     |                              |
| P7-MOD-05 | Gate passes, postal register, call log                        | P7-MOD-01  | ⬜     |                              |

## 7.2 Question Bank & Online Exams / CBT (Plan Module 29)

| ID        | Task                                                                                | Depends on | Status | Notes |
| --------- | ----------------------------------------------------------------------------------- | ---------- | ------ | ----- |
| P7-MOD-06 | Question bank schema (§4.Y) + authoring UI + review/approval workflow               | Launch     | ⬜     |       |
| P7-MOD-07 | Paper generator: blueprint (marks × difficulty × chapters) → auto-select            | P7-MOD-06  | ⬜     |       |
| P7-MOD-08 | Online exam engine: timed CBT, sections, shuffling, negative marking, autosave      | P7-MOD-06  | ⬜     |       |
| P7-MOD-09 | Proctoring: tab-switch detection, fullscreen enforcement, optional webcam snapshots | P7-MOD-08  | ⬜     |       |
| P7-MOD-10 | Auto + manual grading pipeline, item analysis                                       | P7-MOD-08  | ⬜     |       |
| P7-MOD-11 | Seating plan generator + invigilation duty roster with swaps                        | P2-MOD-14  | ⬜     |       |
| P7-MOD-12 | OMR sheet generation + scan evaluation                                              | P7-MOD-06  | ⬜     |       |

## 7.3 Mobile App (Plan §18)

| ID        | Task                                                                                | Depends on | Status | Notes |
| --------- | ----------------------------------------------------------------------------------- | ---------- | ------ | ----- |
| P7-MOB-01 | Expo app scaffold: role-based modes (parent/teacher/student), auth, deep links      | Launch     | ⬜     |       |
| P7-MOB-02 | Parent mode: dashboard, attendance, fee pay, results, homework, notices, messages   | P7-MOB-01  | ⬜     |       |
| P7-MOB-03 | Teacher mode: offline-first attendance (SQLite queue + sync), homework, marks entry | P7-MOB-01  | ⬜     |       |
| P7-MOB-04 | Student mode: timetable, homework submit, results, online exams                     | P7-MOB-01  | ⬜     |       |
| P7-MOB-05 | Push (FCM+APNs) via unified engine, biometric app-lock for teacher mode             | P7-MOB-02  | ⬜     |       |
| P7-MOB-06 | Store release pipeline (EAS) + white-label build system for Enterprise              | P7-MOB-05  | ⬜     |       |

## 7.4 New Care & Campus Modules (Plan Modules 25–28)

| ID        | Task                                                                                                     | Depends on           | Status | Notes               |
| --------- | -------------------------------------------------------------------------------------------------------- | -------------------- | ------ | ------------------- |
| P7-MOD-13 | Health & infirmary (§4.U): records, visits, immunization alerts, medicine consent                        | Launch               | ⬜     |                     |
| P7-MOD-14 | Discipline & behavior (§4.V): incidents, merit/demerit points, action workflow                           | Launch               | ⬜     |                     |
| P7-MOD-15 | Counseling notes (field-encrypted, restricted access)                                                    | P7-MOD-14, P1-MOD-11 | ⬜     |                     |
| P7-MOD-16 | Canteen & wallet (§4.W): wallet topup, POS, parental controls, allergy guard                             | P2-MOD-08            | ⬜     |                     |
| P7-MOD-17 | Alumni (§4.X): auto-conversion on passout, portal, events, donations                                     | P4-MOD-14            | ⬜     |                     |
| P7-MOD-18 | Daycare/playschool pack (§4.AB): daily logs with photos, pickup authorization + verification, milestones | Launch               | ⬜     | Playschool vertical |

## 7.5 Coaching Center Vertical (Plan Module 30)

| ID        | Task                                                                            | Depends on           | Status | Notes            |
| --------- | ------------------------------------------------------------------------------- | -------------------- | ------ | ---------------- |
| P7-MOD-19 | Courses & batches schema (§4.Z) + batch scheduling + capacity                   | P1-MOD-03            | ⬜     |                  |
| P7-MOD-20 | Batch lifecycle: merge, freeze/resume with validity extension, multi-enrollment | P7-MOD-19            | ⬜     |                  |
| P7-MOD-21 | Demo classes linked to enquiry CRM + conversion tracking                        | P7-MOD-19, P7-MOD-01 | ⬜     |                  |
| P7-MOD-22 | Test series: packages, standalone purchase, percentile ranking                  | P7-MOD-08            | ⬜     | Needs CBT engine |
| P7-MOD-23 | Coaching preset polish: terminology, adult-student mode, EMI fee plans          | P7-MOD-19            | ⬜     |                  |

## 7.6 Higher-Ed Vertical (Plan Module 31)

| ID        | Task                                                                         | Depends on           | Status | Notes |
| --------- | ---------------------------------------------------------------------------- | -------------------- | ------ | ----- |
| P7-MOD-24 | Programs/departments/semesters schema (§4.AA)                                | P1-MOD-03            | ⬜     |       |
| P7-MOD-25 | Course units, credits, prerequisites, elective registration with seat limits | P7-MOD-24            | ⬜     |       |
| P7-MOD-26 | GPA engine: SGPA/CGPA, transcripts, backlog re-registration                  | P7-MOD-25, P2-MOD-13 | ⬜     |       |

## 7.7 Platform & Integrations (Plan §17)

| ID        | Task                                                                            | Depends on    | Status | Notes               |
| --------- | ------------------------------------------------------------------------------- | ------------- | ------ | ------------------- |
| P7-API-01 | Public API: tenant API keys, scopes, per-key rate limits, developer docs portal | Launch        | ⬜     |                     |
| P7-API-02 | Webhooks: registration UI, HMAC signing, retries, dead-letter visibility        | P1-API-01     | ⬜     |                     |
| P7-API-03 | Bulk import API endpoints (students, marks, payments) for partners/migrators    | P1-MOD-16     | ⬜     |                     |
| P7-API-04 | Competitor migration extractors (build per legacy system as encountered)        | P7-API-03     | 🔁     | Sales-driven        |
| P7-OPS-01 | Kubernetes migration + autoscaling (when >300 tenants)                          | Scale trigger | ⬜     | Plan §20 milestones |
| P7-OPS-02 | Dedicated-DB provisioning automation for Enterprise tenants                     | P7-OPS-01     | ⬜     |                     |
| P7-OPS-03 | Regional cells + cross-region DR (when >1000 tenants)                           | P7-OPS-01     | ⬜     |                     |

## 7.8 AI & Automation (Plan §23)

| ID       | Task                                                                                 | Depends on           | Status | Notes                      |
| -------- | ------------------------------------------------------------------------------------ | -------------------- | ------ | -------------------------- |
| P7-AI-01 | Timetable auto-generation (constraint solver)                                        | P3-MOD-03            | ⬜     | Highest perceived value    |
| P7-AI-02 | Report card remarks assistant (draft → teacher approves)                             | P2-MOD-18            | ⬜     |                            |
| P7-AI-03 | At-risk student early warning (rules first, ML later)                                | P2-MOD-22            | ⬜     |                            |
| P7-AI-04 | Admin copilot: NL queries over read-only, permission-filtered query layer            | P7-API-01            | ⬜     | Never raw SQL from model   |
| P7-AI-05 | Fee defaulter prediction + reminder-timing optimization                              | P2-MOD-10            | ⬜     |                            |
| P7-AI-06 | Question paper generator from blueprint (extends P7-MOD-07 with AI selection)        | P7-MOD-07            | ⬜     |                            |
| P7-AI-07 | WhatsApp enquiry auto-responder (FAQ bot → counselor handoff)                        | P7-MOD-01, P5-MOD-05 | ⬜     |                            |
| P7-AI-08 | Document OCR: admission form pre-fill from certificate photos                        | P1-MOD-12            | ⬜     |                            |
| P7-AI-09 | AI guardrails: per-tenant opt-in, audit logging of model calls, human approval gates | P7-AI-01             | ⬜     | Ship WITH first AI feature |

---

# CROSS-CUTTING — Continuous Tracks (never "done")

| ID    | Task                                                                 | Cadence               | Status | Notes                            |
| ----- | -------------------------------------------------------------------- | --------------------- | ------ | -------------------------------- |
| CC-01 | Dependency & vulnerability scans (Trivy/Snyk in CI)                  | Every PR              | 🔁     |                                  |
| CC-02 | RLS leak tests extended for every new table                          | Every migration       | 🔁     | Enforced by convention/CI        |
| CC-03 | Permission matrix kept complete for every new endpoint               | Every PR              | 🔁     | CI fails on undeclared endpoints |
| CC-04 | OpenAPI docs regenerated & published                                 | Every release         | 🔁     |                                  |
| CC-05 | Index-usage & slow-query audit                                       | Quarterly             | 🔁     |                                  |
| CC-06 | Backup restore drill                                                 | Quarterly             | 🔁     | DR runbook validation            |
| CC-07 | Load test suite re-run                                               | Before major releases | 🔁     |                                  |
| CC-08 | External penetration test                                            | Annual                | 🔁     | First one in P5                  |
| CC-09 | School-calendar change freeze maintenance                            | Exam/result seasons   | 🔁     | Plan §21                         |
| CC-10 | Compliance watch: DPDP rules, board format changes, UDISE updates    | Ongoing               | 🔁     |                                  |
| CC-11 | ADRs (architecture decision records) written for significant choices | As needed             | 🔁     | Mitigates key-person risk        |
| CC-12 | Seed/demo tenant factories kept current with new modules             | Every module          | 🔁     | Powers demos + E2E               |

---

## Milestone Gates (Go/No-Go Checkpoints)

| Gate                      | After             | Criteria                                                                     |
| ------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| **G1 — Foundation solid** | Phase 0           | CI green; login works; RLS leak harness passing; 2-tenant isolation proven   |
| **G2 — MVP demoable**     | Phase 1           | Full onboard→admit→attendance→notification flow works end-to-end             |
| **G3 — Sellable core**    | Phase 2           | Fees + exams complete; money math audit passed; first demo to a real school  |
| **G4 — Daily-driver**     | Phase 3           | A school can run a full week entirely in Schoolmate                          |
| **G5 — Family-complete**  | Phase 4           | Parent + student portals live; parent pays a fee online                      |
| **G6 — Hardened**         | Phase 5           | Pentest passed; load tests passed; offline attendance works                  |
| **G7 — LAUNCHED**         | Phase 6           | 3–5 pilots running daily ops; billing collecting real money; DR drill passed |
| **G8 — Pro platform**     | Phase 7 (rolling) | Each vertical gated on signed customer demand — never speculative            |
