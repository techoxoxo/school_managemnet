# Schoolmate — Page-Level & Role-Level UX Task Breakdown

> Companion to [SCHOOLMATE_PLAN.md](./SCHOOLMATE_PLAN.md) (what we build) and [SCHOOLMATE_DEV_TASKS.md](./SCHOOLMATE_DEV_TASKS.md) (engineering order).
> This file answers: **"Is every page top-notch, and can every type of user get everything they need for their role, easily?"**
> Each page is a trackable task. A page is DONE only when it passes the Page Quality Checklist below.

## Status Legend

⬜ `TODO` · 🟨 `WIP` · 🟦 `REVIEW` · ✅ `DONE` · ⛔ `BLOCKED`

---

## PART 1 — Global Page Quality Standard (applies to EVERY page)

### The Page Quality Checklist (PQC)

No page is ✅ DONE until all 20 items pass:

| #   | Check                   | Detail                                                                                                                |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | **Loading state**       | Skeleton loaders matching final layout — never blank screens or spinners-only                                         |
| 2   | **Empty state**         | Friendly illustration + one-line explanation + primary action button ("No students yet → Add your first student")     |
| 3   | **Error state**         | Human message + retry button + support link; never raw error codes to end users                                       |
| 4   | **Offline state**       | Detect offline; show banner; queue-capable actions (attendance) keep working                                          |
| 5   | **Permission-aware UI** | Buttons/menus the user can't use are HIDDEN (not disabled-and-confusing); page 403s render a clean "no access" screen |
| 6   | **Responsive**          | Usable at 360px (Android budget phone) → 1920px; tables collapse to cards on mobile                                   |
| 7   | **Keyboard support**    | Tab order logical; Enter submits; Esc closes modals; power screens (attendance, marks) fully keyboard-drivable        |
| 8   | **Accessibility**       | WCAG 2.1 AA: contrast, focus rings, aria labels, screen-reader tested on forms                                        |
| 9   | **Search & filter**     | Every list page: instant search, relevant filters, filter state in URL (shareable/bookmarkable)                       |
| 10  | **Pagination & scale**  | Server-side pagination; page renders fine with 10,000+ rows behind it                                                 |
| 11  | **Bulk actions**        | List pages support select-all + bulk ops where the workflow needs them                                                |
| 12  | **Optimistic UI**       | Fast interactions (mark present, toggle) update instantly, rollback on failure with toast                             |
| 13  | **Confirmation UX**     | Destructive actions: typed-confirm or undo-window; non-destructive: no nagging dialogs                                |
| 14  | **Success feedback**    | Every action confirms via toast/inline state; long jobs show progress + notify on completion                          |
| 15  | **Form quality**        | Inline validation on blur, clear error text under field, unsaved-changes guard, autosave where sensible               |
| 16  | **Terminology pack**    | All labels flow through the terminology layer (Batch vs Class per institute type — Plan §15)                          |
| 17  | **i18n-ready**          | Zero hardcoded strings; dates/numbers/currency localized to tenant config                                             |
| 18  | **Print-friendly**      | Pages users print (timetables, registers, receipts) have print CSS or PDF button                                      |
| 19  | **Help affordance**     | Contextual help icon → relevant help article; first-visit coach marks on complex pages                                |
| 20  | **Performance**         | LCP < 2.5s on 3G-class connection; no layout shift; images lazy + sized                                               |

### Shared Component Tasks (build once, every page benefits)

| ID     | Component                                    | Requirements                                                                                                                                        | Status |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| CMP-01 | `DataTable`                                  | Server pagination, column sort, column show/hide, sticky header, row selection, bulk bar, mobile card collapse, CSV export, URL-synced filter state | ⬜     |
| CMP-02 | `EntitySearch`                               | Global ⌘K search: students/staff/parents/books by name, admission#, phone — role-filtered results                                                   | ⬜     |
| CMP-03 | `FormBuilder`                                | RHF+Zod wrapper: sections, conditional fields, file/photo fields, unsaved guard, dirty indicator                                                    | ⬜     |
| CMP-04 | `PersonCard` / `PersonPicker`                | Photo + name + identifier chip used consistently (student/staff/parent), typeahead picker                                                           | ⬜     |
| CMP-05 | `StatCard` + `ChartCard`                     | Dashboard widgets: value, trend arrow, sparkline, drill-down click                                                                                  | ⬜     |
| CMP-06 | `StatusBadge` + `Timeline`                   | Consistent status colors platform-wide; entity activity timelines                                                                                   | ⬜     |
| CMP-07 | `DateRangePicker`                            | Session-aware presets ("This term", "This month", "This session")                                                                                   | ⬜     |
| CMP-08 | `FileUploader`                               | Drag-drop, camera capture on mobile, progress, type/size validation, image crop for photos                                                          | ⬜     |
| CMP-09 | `NotificationBell` + `NotificationCenter`    | Real-time, grouped by type, mark-read, deep links, preferences link                                                                                 | ⬜     |
| CMP-10 | `AmountInput` + `MoneyDisplay`               | Minor-units safe, tenant currency/locale formatting everywhere money appears                                                                        | ⬜     |
| CMP-11 | `AuditDrawer`                                | "History" slide-over on any record: who changed what, when (reads audit_logs)                                                                       | ⬜     |
| CMP-12 | `EmptyState` / `ErrorState` / `Skeleton` kit | Per PQC #1–3, themed per tenant                                                                                                                     | ⬜     |
| CMP-13 | `WizardShell`                                | Multi-step flows (onboarding, promotion, imports): progress, save-and-resume                                                                        | ⬜     |
| CMP-14 | `PermissionGate`                             | Declarative `<Can permission="fee.payment.collect">` wrapper — single source of UI permission truth                                                 | ⬜     |
| CMP-15 | `PrintLayout`                                | Print-CSS wrapper + "Download PDF" for registers, lists, timetables                                                                                 | ⬜     |

---

## PART 2 — Role Experience Contracts

For each role: what they land on, their top 5 jobs (must be ≤ 2 clicks from landing), and what they must NEVER see. This is the "everyone gets everything according to their role, easily" contract.

| Role                         | Lands on           | Top 5 jobs (≤2 clicks each)                                                               | Must never see                                                  |
| ---------------------------- | ------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Super Admin (us)**         | Platform dashboard | Tenant health, create tenant, billing status, support impersonation, error rates          | Tenant business data beyond support scope (audited access only) |
| **Tenant Admin**             | School dashboard   | Today's attendance %, fee collection today, approvals pending, announcements, add student | Other tenants (obviously); counselor confidential notes         |
| **Branch Admin**             | Branch dashboard   | Same as tenant admin, branch-scoped                                                       | Other branches (unless cross-branch enabled)                    |
| **Teacher**                  | My Day             | Mark attendance, enter marks, post homework, my timetable, message parents                | Other teachers' salary, other classes' marks, fee data          |
| **Class Teacher** (extra)    | My Class           | + Class overview, report card remarks, student concerns, PTM schedule                     | —                                                               |
| **Accountant**               | Fee desk           | Collect fee, defaulter list, today's collection, refunds, reports                         | Marks, counseling, HR data beyond own profile                   |
| **Exam Coordinator**         | Exam control       | Schedule exams, marks-entry progress %, verify marks, publish results                     | Fee data, HR data                                               |
| **Librarian**                | Circulation desk   | Issue, return, overdue list, add book, member lookup                                      | Fees, marks, HR                                                 |
| **Hostel Warden**            | Occupancy board    | Allocations, outing approvals, visitor log, complaints, mess menu                         | Academics, fees                                                 |
| **Transport Manager**        | Fleet board        | Live vehicle map, route management, expiring documents, student-stop mapping              | Academics, fees beyond transport head                           |
| **Receptionist**             | Front desk         | New enquiry, visitor check-in, gate pass, call log, fee-desk redirect                     | Marks, HR, counseling                                           |
| **Counselor**                | Case dashboard     | My sessions today, at-risk list, new referral, incident review                            | Payroll, fees; their notes hidden from everyone else            |
| **Nurse**                    | Infirmary desk     | Log visit, student health lookup (allergy flash), consent check, notify parent            | Academic/fee data                                               |
| **HR Manager**               | HR dashboard       | Leave approvals, payroll run status, expiring contracts, staff attendance                 | Student fee/marks detail                                        |
| **Parent**                   | Children overview  | Pay fees, today's attendance, homework due, message teacher, bus location                 | Other children's data, staff internals, other parents' info     |
| **Student**                  | My Day             | Timetable now/next, homework due, results, library, notices                               | Other students' marks/data, admin functions                     |
| **Coaching Student (adult)** | My Courses         | Batch schedule, test series scores, study material, fee status (self), doubts             | — (gets parent-level rights over self)                          |
| **Alumni**                   | Alumni home        | Update profile, events, transcripts request, donate                                       | Current-student operational data                                |

### Role Contract Verification Tasks

| ID    | Task                                                                                                                             | Status |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| RC-01 | Automated route-access matrix test: every route × every role → expected allow/deny (extends permission matrix tests to frontend) | ⬜     |
| RC-02 | "Two-click audit" per role: scripted check that each role's top-5 jobs are reachable in ≤2 clicks from landing                   | ⬜     |
| RC-03 | Role-based nav config: sidebar generated from role contract, not hand-maintained per page                                        | ⬜     |
| RC-04 | Landing-page redirect logic: each role → its contract landing page after login                                                   | ⬜     |
| RC-05 | Multi-role switcher: user with 2+ roles (teacher who is also a parent) switches context cleanly, data never blends               | ⬜     |
| RC-06 | Usability test per role with real users (1 teacher, 1 parent, 1 accountant minimum) before launch gate G7                        | ⬜     |

---

## PART 3 — Page-by-Page Breakdown

Format: every page is a task. "Must include" lists the features that make it _top-notch_, beyond basic CRUD.

## 3.1 Super Admin Panel (`apps/admin-panel`)

| ID       | Page                   | Must include                                                                                                      | Status |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| PG-SA-01 | Platform dashboard     | MRR/ARR, tenant count by plan/status, signups trend, churn alerts, error-rate & SLO tiles, noisy-tenant detector  | ⬜     |
| PG-SA-02 | Tenant list            | Health score column, plan, usage vs limits, last-active, quick actions (suspend/impersonate/billing)              | ⬜     |
| PG-SA-03 | Tenant detail          | Usage graphs, billing history, feature flags, config viewer, branches, admin contacts, support notes, danger zone | ⬜     |
| PG-SA-04 | Tenant create/onboard  | Wizard: plan, institute preset, limits, trial config, welcome email preview                                       | ⬜     |
| PG-SA-05 | Impersonation flow     | Reason-required modal, time-limited banner while impersonating, separate audit trail, one-click exit              | ⬜     |
| PG-SA-06 | Billing & invoices     | Invoice list/detail, dunning status per tenant, manual adjustments with reason, GST report export                 | ⬜     |
| PG-SA-07 | Plans & feature flags  | Plan editor, per-tenant flag overrides, staged rollout percentage                                                 | ⬜     |
| PG-SA-08 | Support tickets        | Queue, tenant context sidebar, canned responses, escalation                                                       | ⬜     |
| PG-SA-09 | Platform announcements | Broadcast to tenant admins (maintenance windows, new features)                                                    | ⬜     |
| PG-SA-10 | System health          | Queue depths, worker lag, DB replication lag, webhook failure rates, per-tenant API usage                         | ⬜     |

## 3.2 Tenant Admin — Dashboard & Settings

| ID       | Page                       | Must include                                                                                                                                          | Status |
| -------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-AD-01 | School dashboard           | Attendance % today (drill to absentees), fee collected today/this month vs target, pending approvals inbox, upcoming events, birthdays, quick actions | ⬜     |
| PG-AD-02 | Approvals inbox            | Unified queue: leaves, concessions, refunds, TC requests, lesson plans — approve/reject inline with context preview                                   | ⬜     |
| PG-AD-03 | Settings hub               | Card grid of all settings areas with search; recently-changed indicator                                                                               | ⬜     |
| PG-AD-04 | Branches settings          | List, create, per-branch config overrides, main-branch marker                                                                                         | ⬜     |
| PG-AD-05 | Academic session settings  | Create/rollover wizard entry, current-session switch (with impact warning), lock past sessions                                                        | ⬜     |
| PG-AD-06 | Roles & permissions        | Role list, custom role builder (grouped permission checkboxes with plain-language descriptions), "view as role" preview                               | ⬜     |
| PG-AD-07 | User management            | All users, role assignments, invite/reset/deactivate, last-login, force-logout                                                                        | ⬜     |
| PG-AD-08 | Grading settings           | Preset picker + custom scale builder with live preview of a sample report card                                                                        | ⬜     |
| PG-AD-09 | Branding settings          | Logo, colors with live preview, custom domain setup with DNS instructions + verification status                                                       | ⬜     |
| PG-AD-10 | Notification settings      | Per-event channel matrix (SMS/email/push/WhatsApp), SMS credit balance + top-up, template preview                                                     | ⬜     |
| PG-AD-11 | Institute profile settings | Module toggles, terminology editor, attendance mode, adult-student switch (Plan §15)                                                                  | ⬜     |
| PG-AD-12 | Audit trail viewer         | Filterable by user/module/action/date, diff view of changes, export                                                                                   | ⬜     |
| PG-AD-13 | Import center              | All import batches: status, dry-run reports, commit/rollback, template downloads                                                                      | ⬜     |
| PG-AD-14 | Billing (own subscription) | Current plan, usage vs limits, invoices, upgrade flow, payment method                                                                                 | ⬜     |

## 3.3 Students Module Pages

| ID       | Page                    | Must include                                                                                                                                                                                                   | Status |
| -------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-ST-01 | Student list            | Class/section/status filters, photo thumbnails, quick-view drawer, bulk ops (section change, export, message parents), saved filter views                                                                      | ⬜     |
| PG-ST-02 | Student profile         | Tabbed: overview (photo, key info, flags — allergy/fee-due/transport), academics, attendance calendar heatmap, fees, documents, timeline, siblings, hostel/transport; edit-in-place per section per permission | ⬜     |
| PG-ST-03 | Student create/edit     | Sectioned form, photo capture/crop, duplicate warning (same name+DOB), draft save                                                                                                                              | ⬜     |
| PG-ST-04 | Student timeline        | Unified chronology: admission, promotions, payments, incidents, achievements, documents                                                                                                                        | ⬜     |
| PG-ST-05 | Admissions pipeline     | Kanban by status with drag, applicant detail drawer, document checklist, test/interview scores, one-click convert-to-student, funnel stats header                                                              | ⬜     |
| PG-ST-06 | Admission form (public) | Tenant-branded public page, mobile-first, save-and-resume via OTP link, document upload, payment of form fee, confirmation with tracking number                                                                | ⬜     |
| PG-ST-07 | Promotion wizard        | Session rollover: class→class mapping, per-student promote/detain grid with results context, fee-clearance flags, dry-run summary, execute with progress                                                       | ⬜     |
| PG-ST-08 | Transfer/TC flow        | Clearance checklist (fees, library, hostel), TC preview, generate + record, status change                                                                                                                      | ⬜     |
| PG-ST-09 | ID card studio          | Template pick, batch select, preview grid, print-ready PDF                                                                                                                                                     | ⬜     |

## 3.4 Staff / HR Module Pages

| ID       | Page                     | Must include                                                                                                                  | Status |
| -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-HR-01 | Staff list               | Department/designation/type filters, contact quick-copy, workload column (periods/week)                                       | ⬜     |
| PG-HR-02 | Staff profile            | Tabs: overview, qualifications & docs, timetable, attendance, leaves, payroll (permission-gated), assets issued               | ⬜     |
| PG-HR-03 | Leave approvals          | Pending queue with team-calendar conflict view ("3 other teachers off that day"), balance context, approve/reject with reason | ⬜     |
| PG-HR-04 | Leave apply (staff self) | Balance display, date range with holiday awareness, document upload when rule requires, status tracker                        | ⬜     |
| PG-HR-05 | Staff attendance board   | Day grid all staff, biometric sync status, exceptions highlighted, month summary                                              | ⬜     |
| PG-HR-06 | Payroll run              | Month wizard: generate → review grid (exceptions flagged: LOP, new joiners) → approve → mark paid; payslip bulk email         | ⬜     |
| PG-HR-07 | Payslip (staff self)     | Monthly list, PDF download, YTD summary, tax view                                                                             | ⬜     |
| PG-HR-08 | Substitution board       | Today's absent teachers, affected periods, free-teacher suggestions ranked by load, one-click assign + notify                 | ⬜     |

## 3.5 Attendance Pages

| ID       | Page                        | Must include                                                                                                                                                           | Status |
| -------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-AT-01 | Mark attendance (teacher)   | Photo roster grid, all-present default, tap/keyboard toggle, absent-reason quick pick, previous-day copy, offline queue badge, submit-once lock with edit-request flow | ⬜     |
| PG-AT-02 | Period attendance           | Period selector, carry-forward from previous period, discrepancy flag (present P1, absent P3 → alert)                                                                  | ⬜     |
| PG-AT-03 | Attendance overview (admin) | Live: marked/unmarked classes, school % today, absentee list with parent-notify status, nudge unmarked teachers                                                        | ⬜     |
| PG-AT-04 | Attendance reports          | Register view (printable month grid), student %, shortage list vs exam-eligibility threshold, trends chart                                                             | ⬜     |
| PG-AT-05 | Attendance settings         | Mode, notify rules, thresholds, late rules — with plain-language explanations of each rule's effect                                                                    | ⬜     |

## 3.6 Fee Module Pages

| ID       | Page                    | Must include                                                                                                                                                                             | Status |
| -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-FE-01 | Fee desk (collect)      | Student search (name/adm#/parent phone), outstanding breakdown by head+installment, part-payment allocation preview, mode capture, instant receipt print/WhatsApp, sibling combined view | ⬜     |
| PG-FE-02 | Fee structure builder   | Head list with frequencies, installment plan visual timeline, late-fee rule builder with worked example preview, clone-from-last-session                                                 | ⬜     |
| PG-FE-03 | Allocations page        | Class-wise allocation status, unallocated-student alert, bulk allocate, per-student overrides                                                                                            | ⬜     |
| PG-FE-04 | Discounts & concessions | Rules list, auto-apply preview ("would affect 34 students"), approval queue, per-student concession with reason + document                                                               | ⬜     |
| PG-FE-05 | Payments ledger         | All transactions, gateway status chips, reconciliation mismatches highlighted, refund initiation, receipt reprint (audited)                                                              | ⬜     |
| PG-FE-06 | Defaulters              | Aging buckets (0-30/31-60/61+), amount totals, one-click reminder batch (channel choice), promise-to-pay notes, exclusion flags (optional heads)                                         | ⬜     |
| PG-FE-07 | Fee reports             | Daily collection register (cashier-wise for cash reconciliation), head-wise, class-wise outstanding, collection-efficiency trend                                                         | ⬜     |
| PG-FE-08 | Cheque management       | Pending clearance list, bounce workflow (reverse + penalty + notify), bank deposit slips                                                                                                 | ⬜     |

## 3.7 Examination Pages

| ID       | Page                             | Must include                                                                                                                                                        | Status |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-EX-01 | Exam setup                       | Exam types with weightages, session exam calendar, clone-last-year                                                                                                  | ⬜     |
| PG-EX-02 | Datesheet builder                | Drag exams onto calendar, conflict warnings (same class 2 exams/day, room clashes), publish to students/parents                                                     | ⬜     |
| PG-EX-03 | Marks entry (teacher)            | Spreadsheet grid: arrow-key navigation, paste-from-Excel, out-of-range instant flag, absent/exempt shortcuts, autosave, progress indicator, submit-for-verification | ⬜     |
| PG-EX-04 | Verification (HOD/coordinator)   | Entered-vs-verified matrix by class×subject, spot-check view with outlier highlighting (class avg anomalies), bulk verify, send-back with note                      | ⬜     |
| PG-EX-05 | Results control room             | Publish readiness checklist (all verified? report cards pre-generated? cache warmed?), scheduled publish, publish progress, rollback within window                  | ⬜     |
| PG-EX-06 | Report card designer             | Template gallery (CBSE/ICSE/state/custom), drag-section layout editor, live preview with real student data, per-class template assignment                           | ⬜     |
| PG-EX-07 | Class performance analytics      | Subject averages, distribution histograms, topper lists, section comparison, failing-students list with drill-down                                                  | ⬜     |
| PG-EX-08 | Student result view (staff-side) | Full history across exams, trend sparkline per subject, remarks entry (class teacher)                                                                               | ⬜     |

## 3.8 Timetable Pages

| ID       | Page                   | Must include                                                                                                                        | Status |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-TT-01 | Timetable builder      | Drag-drop grid, teacher/room conflict live-blocking, teacher load sidebar (periods used/free), copy week, effective-date scheduling | ⬜     |
| PG-TT-02 | Class timetable view   | Clean weekly grid, current-period highlight, substitution overlays, print/PDF                                                       | ⬜     |
| PG-TT-03 | Teacher timetable view | Own week, free periods visible, substitution assignments flagged                                                                    | ⬜     |
| PG-TT-04 | Room utilization       | Room × period heatmap, find-free-room tool                                                                                          | ⬜     |

## 3.9 Library Pages

| ID       | Page                        | Must include                                                                                                                   | Status |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| PG-LB-01 | Circulation desk            | Single screen: scan/search member → their issues + fines → scan book → issue/return/renew; fine collect inline; keyboard-first | ⬜     |
| PG-LB-02 | Catalog                     | Cover-image grid/table toggle, availability chips, ISBN quick-add with autofill, bulk import, barcode label print queue        | ⬜     |
| PG-LB-03 | Member view                 | Student/staff lookup: current issues, history, fines, reading stats                                                            | ⬜     |
| PG-LB-04 | Overdue & fines             | Aging list, reminder batch, fine waiver (permission + reason), collection summary                                              | ⬜     |
| PG-LB-05 | Stock audit                 | Scan-based verification workflow, missing/damaged marking, audit report                                                        | ⬜     |
| PG-LB-06 | OPAC (student/staff search) | Public-style search with availability, reserve button, new arrivals shelf                                                      | ⬜     |

## 3.10 Hostel Pages

| ID       | Page                  | Must include                                                                                          | Status |
| -------- | --------------------- | ----------------------------------------------------------------------------------------------------- | ------ |
| PG-HO-01 | Occupancy board       | Visual floor/room grid, color by status, click room → occupants, drag-assign students, capacity stats | ⬜     |
| PG-HO-02 | Allocation flow       | Student picker with gender/hostel-type validation, bed selection, charges preview → fee integration   | ⬜     |
| PG-HO-03 | Outing/leave requests | Request queue with parent-consent status, approve → gate pass, return check-in, overdue-return alerts | ⬜     |
| PG-HO-04 | Visitor log           | Fast check-in (repeat-visitor recall), photo capture, student notify, checkout                        | ⬜     |
| PG-HO-05 | Mess menu             | Week editor, publish to portal, feedback summary                                                      | ⬜     |

## 3.11 Transport Pages

| ID       | Page                      | Must include                                                                                                            | Status |
| -------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-TR-01 | Fleet board               | Vehicle cards: live status, driver, route, expiring-document badges (30/7-day warnings)                                 | ⬜     |
| PG-TR-02 | Live map                  | All vehicles, route overlays, stop ETAs, geofence alert feed, per-vehicle history playback                              | ⬜     |
| PG-TR-03 | Route builder             | Map-based stop placement, stop times, fee per stop, student count per stop, capacity warnings                           | ⬜     |
| PG-TR-04 | Student transport mapping | Assign route+stop, pickup/drop/both, fee preview → fee integration, route-wise student roster (printable for conductor) | ⬜     |

## 3.12 Communication Pages

| ID       | Page                       | Must include                                                                                                                                                             | Status |
| -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| PG-CM-01 | Compose announcement       | Audience builder with live recipient count, channel selection with per-channel cost estimate (SMS credits), schedule, require-acknowledgment toggle, preview per channel | ⬜     |
| PG-CM-02 | Announcement list & detail | Delivery stats (sent/delivered/read/acknowledged), resend-to-unread, acknowledgment chase list                                                                           | ⬜     |
| PG-CM-03 | Messages inbox             | Threaded, role-safe recipient picker (teacher can msg own students' parents only), attachments, unread badges, canned replies                                            | ⬜     |
| PG-CM-04 | Emergency broadcast        | Big red flow: pre-approved templates, all-channels blast, confirmation step, delivery live-tracker                                                                       | ⬜     |
| PG-CM-05 | Communication log          | Every outbound message: channel, status, cost; failure retry; per-student communication history                                                                          | ⬜     |

## 3.13 Parent Portal Pages (quality bar: consumer-app grade)

| ID       | Page                             | Must include                                                                                                                                     | Status |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| PG-PA-01 | Children overview (landing)      | Card per child: photo, attendance today, next fee due (amount+date), latest result, homework-due count; tap → child home                         | ⬜     |
| PG-PA-02 | Child home                       | Today strip (attendance, periods, homework), alerts (fee due, low attendance, unread notices), quick actions: pay/message/leave                  | ⬜     |
| PG-PA-03 | Pay fees                         | Outstanding by installment, select-and-pay, gateway flow, instant receipt, payment history, auto-receipt to email/WhatsApp, sibling combined pay | ⬜     |
| PG-PA-04 | Attendance view                  | Month calendar heatmap, absence reasons, % vs required, notify-me settings                                                                       | ⬜     |
| PG-PA-05 | Results                          | Per-exam cards, subject table, trend graph across exams, report card PDF downloads                                                               | ⬜     |
| PG-PA-06 | Homework                         | Due/done lists per child, attachment view, teacher remarks                                                                                       | ⬜     |
| PG-PA-07 | Messages & notices               | Thread with teachers, notices feed with acknowledgment buttons                                                                                   | ⬜     |
| PG-PA-08 | Bus tracking                     | Live map, ETA to my stop, arrival push opt-in, driver contact (masked call)                                                                      | ⬜     |
| PG-PA-09 | Leave application                | Date pick, reason, document (medical), status tracking                                                                                           | ⬜     |
| PG-PA-10 | PTM booking                      | Teacher slot grid, book/reschedule, calendar add, reminder                                                                                       | ⬜     |
| PG-PA-11 | Documents                        | Report cards, receipts, certificates, TC — all downloadable in one place                                                                         | ⬜     |
| PG-PA-12 | Daycare feed (playschool preset) | Photo timeline of day: meals, nap, activities, mood; comment/heart; pickup-auth management                                                       | ⬜     |
| PG-PA-13 | Profile & preferences            | Contact info update (approval-gated), notification channel preferences, language                                                                 | ⬜     |

## 3.14 Student Portal Pages

| ID       | Page                  | Must include                                                                                                                                  | Status |
| -------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-SP-01 | My Day (landing)      | Now/next period, homework due today/this week, upcoming exams countdown, unread notices                                                       | ⬜     |
| PG-SP-02 | Homework & submission | Due list, submit with file/photo/text, late flag, grades + feedback                                                                           | ⬜     |
| PG-SP-03 | My results            | Exam list, marks, grade, class-average comparison (if tenant allows), report cards                                                            | ⬜     |
| PG-SP-04 | My attendance         | % with eligibility threshold indicator, month view                                                                                            | ⬜     |
| PG-SP-05 | Library               | OPAC search, my issues + due dates, renew, reserve                                                                                            | ⬜     |
| PG-SP-06 | Online exam room      | Pre-checks (connection, fullscreen), timer, question palette (answered/marked/skipped), autosave indicator, submit confirm, post-submit state | ⬜     |
| PG-SP-07 | Certificates request  | Request bonafide/character, status, download when ready                                                                                       | ⬜     |

## 3.15 Front Office / Enquiry CRM Pages (Phase 7)

| ID       | Page                           | Must include                                                                                                                    | Status |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-FO-01 | Enquiry kanban                 | Stage columns, drag to advance, overdue-follow-up badges, counselor filter, quick-log follow-up from card                       | ⬜     |
| PG-FO-02 | Enquiry detail                 | Contact info with click-to-call/WhatsApp, follow-up timeline, next-action scheduler, demo/visit booking, convert-to-application | ⬜     |
| PG-FO-03 | Front desk home (receptionist) | Today: expected visitors, scheduled visits, follow-ups due, quick actions (new enquiry/visitor/gate pass/call log)              | ⬜     |
| PG-FO-04 | Admission funnel analytics     | Stage conversion rates, source ROI, counselor leaderboard, lost-reason breakdown, season comparison                             | ⬜     |
| PG-FO-05 | Visitor kiosk mode             | Tablet-friendly self check-in: phone, purpose, photo, badge print, host notify                                                  | ⬜     |

## 3.16 Health, Discipline & Counseling Pages (Phase 7)

| ID       | Page                              | Must include                                                                                                                                                | Status |
| -------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-HD-01 | Infirmary desk                    | Student quick-lookup with ALLERGY FLASH banner, visit log form, medicine consent check (blocks unconsented meds), parent notify one-tap, send-home workflow | ⬜     |
| PG-HD-02 | Health record (per student)       | Growth chart vs percentiles, immunization timeline with due alerts, conditions & documents                                                                  | ⬜     |
| PG-HD-03 | Incident logging                  | Structured form, severity guide, witness picker, evidence upload, confidential toggle, action workflow trigger                                              | ⬜     |
| PG-HD-04 | Behavior overview (class teacher) | Class merit/demerit board, repeat-pattern alerts, incident history per student (permission-tiered visibility)                                               | ⬜     |
| PG-HD-05 | Counselor casebook                | My cases, session notes (encrypted, visible only to counselor + designated admin), referrals inbox, at-risk feed                                            | ⬜     |

## 3.17 Coaching Vertical Pages (Phase 7)

| ID       | Page                            | Must include                                                                                                        | Status |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------ |
| PG-CO-01 | Batch board                     | Batch cards: strength/capacity bar, schedule, faculty, fill-rate warnings, merge suggestion for under-filled        | ⬜     |
| PG-CO-02 | Batch detail                    | Roster, session-wise attendance, syllabus progress, test performance summary                                        | ⬜     |
| PG-CO-03 | Test series dashboard (student) | Upcoming tests, score history with percentile trend, All-India-Rank style leaderboard (opt-in), weak-topic analysis | ⬜     |
| PG-CO-04 | Demo class scheduler            | Slots calendar, enquiry link, attended/converted tracking                                                           | ⬜     |
| PG-CO-05 | Study material library          | Course/chapter tree, enrollment-gated access, view tracking                                                         | ⬜     |

## 3.18 Higher-Ed Vertical Pages (Phase 7)

| ID       | Page                            | Must include                                                                                              | Status |
| -------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| PG-HE-01 | Program & semester setup        | Program tree, semester windows, course-unit catalog with credits/prereqs                                  | ⬜     |
| PG-HE-02 | Elective registration (student) | Available units with seats-left live counter, prereq eligibility auto-check, cart-style confirm, waitlist | ⬜     |
| PG-HE-03 | Faculty grade entry             | Unit roster, grade entry with scale validation, submit → HOD approval                                     | ⬜     |
| PG-HE-04 | Transcript & CGPA (student)     | Semester-wise SGPA cards, CGPA trend, backlog list with re-registration CTA, official transcript request  | ⬜     |

---

## PART 4 — Per-Module Quality Deep-Dives (beyond pages)

The details that separate "works" from "top-notch":

| ID    | Quality task                                                                                                                            | Module        | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| QD-01 | Attendance in <60 seconds: measure real teachers marking a 40-student class; optimize until median <60s                                 | Attendance    | ⬜     |
| QD-02 | Fee desk under queue pressure: collect-and-print cycle <30s; test with barcode scanner + thermal printer                                | Fees          | ⬜     |
| QD-03 | Marks entry for a full class×subject <10 min including Excel paste path                                                                 | Exams         | ⬜     |
| QD-04 | Parent fee payment in ≤4 taps from app open (login remembered)                                                                          | Parent portal | ⬜     |
| QD-05 | Report card visual QA: pixel-review of every template at A4 print, long names, 12+ subjects, Hindi text                                 | Exams         | ⬜     |
| QD-06 | Circulation desk fully usable with only a barcode scanner + Enter key (no mouse)                                                        | Library       | ⬜     |
| QD-07 | Dashboard truthfulness audit: every number on every dashboard clicks through to the exact records behind it                             | All           | ⬜     |
| QD-08 | Notification sanity: dedupe (no double SMS), quiet hours, digest option for low-priority — parents must never feel spammed              | Comms         | ⬜     |
| QD-09 | Slow-network drill: whole app tested at throttled 3G; every page still usable                                                           | All           | ⬜     |
| QD-10 | Vernacular review: Hindi translations reviewed by native speaker in real UI (not spreadsheet)                                           | All           | ⬜     |
| QD-11 | Data-density modes: compact table mode for power users (accountant, coordinator)                                                        | All           | ⬜     |
| QD-12 | Onboarding empty-tenant experience: every module's first-visit state guides setup ("No fee structure yet → create one → here's how")    | All           | ⬜     |
| QD-13 | Cross-module flag propagation: allergy → canteen POS + trip rosters; fee-block → promotion wizard; discipline-critical → counselor feed | Platform      | ⬜     |
| QD-14 | Session-boundary correctness: every page respects selected academic session; switching sessions never mixes data                        | Platform      | ⬜     |
| QD-15 | Receipt/certificate tamper resistance: QR verification page, sequential numbering gap detection report                                  | Fees/Certs    | ⬜     |

---

## PART 5 — Rollout Order & Gate Mapping

Page tasks slot into the engineering phases of [SCHOOLMATE_DEV_TASKS.md](./SCHOOLMATE_DEV_TASKS.md):

| Engineering phase | Page tasks due                                                                 | Quality tasks due              |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| Phase 0           | CMP-01…CMP-15, RC-03, RC-04                                                    | —                              |
| Phase 1           | PG-SA-01…04, PG-AD-01/03/04/05/07/11/13, PG-ST-01…06, PG-HR-01/02, PG-AT-01…05 | QD-01, QD-12                   |
| Phase 2           | PG-FE-01…08, PG-EX-01…08                                                       | QD-02, QD-03, QD-05            |
| Phase 3           | PG-TT-01…04, PG-HR-03…08, PG-LB-01…06, PG-CM-01…05, PG-AD-02/10                | QD-06, QD-08                   |
| Phase 4           | PG-HO-01…05, PG-TR-01…04, PG-PA-01…13, PG-SP-01…07, PG-ST-07…09                | QD-04, QD-07, QD-13, QD-14     |
| Phase 5           | PG-AD-06/08/09/12, PG-SP-06, remaining settings                                | QD-09, QD-10, QD-11, QD-15     |
| Phase 6           | PG-SA-05…10, PG-AD-14, RC-01, RC-02, RC-05, RC-06                              | Full PQC re-audit of all pages |
| Phase 7           | PG-FO-_, PG-HD-_, PG-CO-_, PG-HE-_, PG-PA-12                                   | PQC applies to each as built   |

**Rule**: a phase gate (G1–G8) cannot pass while any of its mapped page tasks fail the 20-point Page Quality Checklist.
