# Schoolmate — Complete SaaS School Management Platform

## Project Vision

**Schoolmate** is a multi-tenant SaaS platform that onboards educational institutions (schools, colleges, coaching centers, kindergartens, playgroups) as tenants. Each tenant can have multiple branches, custom configurations, and role-based access for administrators, staff, students, and parents.

---

## Table of Contents

1. [Tech Stack & Infrastructure](#1-tech-stack--infrastructure)
2. [Architecture Overview](#2-architecture-overview)
3. [Multi-Tenancy Strategy](#3-multi-tenancy-strategy)
4. [Database Design](#4-database-design)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [Module Breakdown](#6-module-breakdown)
7. [API Design](#7-api-design)
8. [Frontend Architecture](#8-frontend-architecture)
9. [Real-World Edge Cases & Loopholes](#9-real-world-edge-cases--loopholes)
10. [Deployment & DevOps](#10-deployment--devops)
11. [Phased Roadmap](#11-phased-roadmap)
12. [Monetization & Licensing](#12-monetization--licensing)
13. [Data Security Architecture](#13-data-security-architecture)
14. [Report Cards & Reporting Engine](#14-report-cards--reporting-engine)
15. [Institute-Type Support Matrix](#15-institute-type-support-matrix)
16. [SaaS Billing & Tenant Lifecycle Engine](#16-saas-billing--tenant-lifecycle-engine)
17. [Event-Driven Architecture, Webhooks & Public API](#17-event-driven-architecture-webhooks--public-api)
18. [Mobile App Strategy](#18-mobile-app-strategy)
19. [Data Migration & Onboarding Playbook](#19-data-migration--onboarding-playbook)
20. [Scalability & Performance Engineering](#20-scalability--performance-engineering)
21. [Observability, SLOs & Incident Management](#21-observability-slos--incident-management)
22. [Testing & Quality Strategy](#22-testing--quality-strategy)
23. [AI & Automation Layer](#23-ai--automation-layer)
24. [Go-To-Market & Growth](#24-go-to-market--growth)
25. [Risk Register](#25-risk-register)

---

## 1. Tech Stack & Infrastructure

| Layer                  | Technology                                   | Why                                                                                 |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Backend**            | Fastify (Node.js)                            | High performance, schema-based validation, plugin architecture                      |
| **Frontend**           | Next.js 14+ (App Router)                     | SSR/SSG, middleware for tenant routing, React Server Components                     |
| **Database**           | PostgreSQL 16                                | JSONB for flexible configs, Row Level Security for tenancy, robust relational model |
| **Cache/Queue**        | Redis 7                                      | Session cache, rate limiting, pub/sub for real-time notifications, Bull queues      |
| **Search**             | Meilisearch                                  | Full-text search for students, staff, library catalog                               |
| **File Storage**       | S3-compatible (MinIO for self-host / AWS S3) | Documents, photos, report cards                                                     |
| **Realtime**           | Socket.IO (via Fastify plugin)               | Live notifications, chat, attendance alerts                                         |
| **Email**              | Nodemailer + SES/SMTP                        | Transactional emails, fee reminders                                                 |
| **SMS**                | Twilio / MSG91 (India)                       | OTP, fee alerts, emergency notifications                                            |
| **Push Notifications** | Firebase Cloud Messaging                     | Mobile app notifications for parents                                                |
| **PDF Generation**     | Puppeteer / @react-pdf                       | Report cards, fee receipts, certificates                                            |
| **Containerization**   | Docker + Docker Compose                      | Dev parity, isolated services                                                       |
| **Orchestration**      | Docker Compose (early) → Kubernetes (scale)  | Progressive scaling                                                                 |
| **CI/CD**              | GitHub Actions                               | Automated testing, deployment                                                       |
| **Monitoring**         | Prometheus + Grafana + Sentry                | Metrics, error tracking                                                             |
| **Logging**            | Pino (Fastify native) + ELK stack            | Structured logging                                                                  |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOAD BALANCER (Nginx/Traefik)            │
│                  *.schoolmate.app / custom domains               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
              ┌─────────────┴──────────────┐
              │                            │
    ┌─────────▼─────────┐      ┌───────────▼──────────┐
    │   Next.js Frontend │      │   Fastify API Server  │
    │   (SSR + Static)   │      │   (REST + WebSocket)  │
    │   Port: 3000       │      │   Port: 4000          │
    └─────────┬─────────┘      └───────────┬──────────┘
              │                            │
              │              ┌─────────────┼──────────────┐
              │              │             │              │
         ┌────▼────┐   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
         │ Redis   │   │PostgreSQL│   │   S3    │   │Meilisearch│
         │ Cache   │   │ Primary  │   │ Storage │   │ Search   │
         │ Queue   │   │ + Read   │   │         │   │          │
         └─────────┘   │ Replicas │   └─────────┘   └──────────┘
                       └──────────┘

    ┌──────────────────────────────────────────────────────┐
    │              BACKGROUND WORKERS (Bull)                │
    │  Fee reminders │ Report gen │ Sync │ Notifications    │
    └──────────────────────────────────────────────────────┘
```

### Service Boundaries

```
schoolmate/
├── apps/
│   ├── api/                  # Fastify backend (monolith-first)
│   ├── web/                  # Next.js frontend
│   ├── worker/               # Background job processor
│   └── admin-panel/          # Super-admin dashboard (Next.js)
├── packages/
│   ├── shared/               # Shared types, validators, constants
│   ├── db/                   # Drizzle ORM schema + migrations
│   ├── email-templates/      # React Email templates
│   └── pdf-templates/        # Report card, receipt templates
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── k8s/ (future)
└── docs/
```

**Monorepo**: Turborepo for build orchestration.

---

## 3. Multi-Tenancy Strategy

### Approach: Hybrid Tenancy (Plan-Based Isolation)

| Plan               | Isolation Strategy                   | Description                                                                                        |
| ------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Starter/Growth** | Shared DB + Row-Level Security (RLS) | `tenant_id` on every row, PostgreSQL RLS policies, cheapest to operate                             |
| **Professional**   | Separate Schema per tenant           | Own schema within shared DB, better isolation, per-tenant backup/restore                           |
| **Enterprise**     | Dedicated Database                   | Complete data isolation, independent backup, compliance-ready, can be in tenant's preferred region |

The application code stays identical — only the **connection routing** changes based on tenant's `isolation_level` config. Tenants can be upgraded from shared → schema → dedicated without code changes.

| Context                      | Used For                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| **Row-Level Security (RLS)** | Default for Starter/Growth — `tenant_id` column on every table, enforced by PostgreSQL policies |
| **Separate Schema**          | Professional plan — own schema within shared DB cluster                                         |
| **Dedicated Database**       | Enterprise plan — fully isolated DB instance, can be in tenant's region                         |
| **Tenant Context**           | Resolved from subdomain (`springdale.schoolmate.app`) or custom domain                          |

### Tenant Resolution Flow

```
Request → Extract subdomain/domain
       → Redis cache lookup (domain → tenant_id)
       → If miss: DB lookup → cache it (TTL: 1 hour)
       → Inject tenant_id into request context
       → All queries automatically scoped via RLS policy
```

### Branch Hierarchy

```
Platform (Schoolmate SaaS)
  └── Tenant (e.g., Springfield Academy)
       ├── Branch A (Main Campus)
       │    ├── Sessions/Academic Years
       │    ├── Classes & Sections
       │    └── Staff, Students, etc.
       ├── Branch B (City Campus)
       └── Branch C (Junior Wing)
```

### Key Design Decisions

- **`tenant_id`** on every row — enforced by PostgreSQL RLS policies
- **`branch_id`** on branch-specific data (students, staff, classes)
- **Cross-branch visibility** configurable per tenant (some schools want unified view)
- **Custom domain mapping** — tenants can bring their own domain (CNAME → our LB)
- **Tenant-level config** stored as JSONB: grading systems, fee structures, academic calendar

---

## 4. Database Design

### Core Entity Relationship Overview

```
tenants ──< branches ──< academic_sessions
                │               │
                ├──< classes ───┤──< sections ──< class_students
                │               │
                ├──< staff_members ──< staff_attendance
                │               │
                ├──< students ──┤──< student_attendance
                │    │          │
                │    ├──< fee_allocations ──< fee_payments
                │    ├──< exam_results
                │    ├──< library_issues
                │    └──< hostel_allocations
                │
                ├──< parents ──< parent_student (M2M)
                │
                ├──< subjects ──< syllabus_entries
                │
                └──< rooms (classrooms, labs, hostel rooms)
```

### Critical Tables (Grouped by Module)

#### A. Platform & Tenancy

```sql
-- Platform-level (no tenant_id)
tenants (
  id UUID PK,
  name, slug (unique),
  custom_domain,
  subscription_plan, subscription_status,
  config JSONB,          -- grading system, currency, timezone, locale
  logo_url, theme JSONB,
  max_branches, max_students, -- plan limits
  onboarded_at, created_at, updated_at,
  is_active, suspended_at, suspension_reason
)

tenant_billing (
  id, tenant_id FK,
  plan_id, billing_cycle,
  next_billing_date, amount,
  payment_gateway_customer_id,
  auto_renew, trial_ends_at
)

-- All tables below have tenant_id + RLS
branches (
  id, tenant_id,
  name, code, address JSONB,
  phone, email, principal_name,
  is_main_branch, is_active,
  config JSONB  -- branch-specific overrides
)

academic_sessions (
  id, tenant_id, branch_id,
  name,                    -- "2025-2026"
  start_date, end_date,
  is_current, is_locked,   -- locked = no more edits
  config JSONB              -- term structure, exam schedule
)
```

#### B. Users & Authentication

```sql
users (
  id UUID PK,
  email (unique globally), phone,
  password_hash,
  is_email_verified, is_phone_verified,
  mfa_enabled, mfa_secret,
  last_login_at, failed_login_attempts, locked_until,
  status ENUM('active','inactive','suspended'),
  created_at, updated_at
)

-- A user can belong to multiple tenants with different roles
user_tenant_roles (
  id, user_id FK, tenant_id FK, branch_id FK (nullable),
  role ENUM('super_admin','tenant_admin','branch_admin',
            'teacher','accountant','librarian','hostel_warden',
            'transport_manager','receptionist','counselor',
            'student','parent','custom'),
  custom_role_id FK (nullable),
  permissions JSONB,        -- override/extend role permissions
  is_primary_role,
  joined_at, is_active
)

custom_roles (
  id, tenant_id,
  name, description,
  permissions JSONB,        -- granular permission list
  created_by, created_at
)

-- Granular permissions
permissions_catalog (
  id, module, action,
  description
  -- e.g., module='fee', action='create_structure'
  -- e.g., module='exam', action='enter_marks'
)
```

#### C. Students & Admissions

```sql
students (
  id, tenant_id, branch_id, user_id FK,
  admission_number (unique per tenant),
  roll_number,
  first_name, last_name, date_of_birth,
  gender, blood_group,
  nationality, religion, caste, category,  -- required for govt reports in many countries
  aadhaar_number,                           -- India-specific, encrypted
  photo_url,
  current_class_id, current_section_id,
  admission_date, admission_class_id,
  previous_school_name, transfer_certificate_number,
  status ENUM('active','alumni','transferred','expelled','dropout','passout'),
  status_changed_at, status_reason,
  medical_info JSONB,      -- allergies, conditions, emergency meds
  transport_opted, hostel_opted,
  created_at, updated_at
)

student_documents (
  id, student_id, tenant_id,
  document_type ENUM('birth_cert','transfer_cert','marksheet','photo','aadhaar','medical','custom'),
  file_url, file_name, uploaded_by, verified, verified_by,
  created_at
)

student_class_history (
  id, student_id, tenant_id,
  academic_session_id, class_id, section_id,
  roll_number,
  promoted_from_id,        -- self-reference for tracking promotions
  result ENUM('promoted','detained','transferred','passout'),
  remarks
)

admissions (
  id, tenant_id, branch_id,
  academic_session_id,
  applicant_name, date_of_birth, gender,
  parent_name, parent_phone, parent_email,
  applied_for_class_id,
  form_data JSONB,          -- dynamic admission form fields
  documents JSONB,
  status ENUM('pending','under_review','entrance_test','interview',
              'waitlisted','offered','accepted','rejected','withdrawn'),
  status_history JSONB,     -- [{status, changed_by, at, remarks}]
  entrance_test_score, interview_remarks,
  offered_at, accepted_at,
  converted_student_id,     -- links to student record after acceptance
  created_at, updated_at
)
```

#### D. Parents/Guardians

```sql
parents (
  id, tenant_id, user_id FK,
  first_name, last_name,
  relation ENUM('father','mother','guardian','other'),
  phone, alt_phone, email,
  occupation, employer,
  address JSONB,
  photo_url,
  annual_income,            -- needed for scholarship/fee concession decisions
  is_emergency_contact,
  created_at, updated_at
)

parent_student (
  id, parent_id, student_id, tenant_id,
  relation,
  is_primary_contact,       -- who gets SMS/calls first
  can_pickup,               -- authorized for pickup (playschool/kindergarten)
  created_at
)
```

#### E. Staff / HR

```sql
staff_members (
  id, tenant_id, branch_id, user_id FK,
  employee_id (unique per tenant),
  first_name, last_name, date_of_birth,
  gender, blood_group, photo_url,
  designation, department,
  employment_type ENUM('permanent','contract','part_time','visiting'),
  qualification, experience_years, specialization,
  date_of_joining, date_of_leaving, leaving_reason,
  salary_grade, base_salary,
  bank_details JSONB (encrypted),  -- account_no, ifsc, bank_name
  pan_number, aadhaar_number,      -- encrypted
  address JSONB,
  emergency_contact JSONB,
  status ENUM('active','on_leave','resigned','terminated','retired'),
  created_at, updated_at
)

staff_attendance (
  id, tenant_id, branch_id, staff_id,
  date,
  check_in_time, check_out_time,
  status ENUM('present','absent','half_day','late','on_leave','holiday','weekend'),
  marked_by,                -- self/admin/biometric
  source ENUM('manual','biometric','app','qr'),
  remarks, ip_address,
  created_at
)

staff_leaves (
  id, tenant_id, staff_id,
  leave_type_id FK,
  start_date, end_date, total_days,
  reason, supporting_document_url,
  status ENUM('pending','approved','rejected','cancelled'),
  approved_by, approved_at, rejection_reason,
  created_at
)

leave_types (
  id, tenant_id,
  name,                     -- casual, sick, earned, maternity, etc.
  allowed_per_year,
  is_paid, is_carry_forward,
  max_carry_forward_days,
  applicable_to JSONB,      -- which designations/departments
  requires_document_after_days,  -- e.g., medical cert after 2 days sick leave
  created_at
)

payroll (
  id, tenant_id, staff_id,
  month, year,
  base_salary,
  allowances JSONB,         -- [{name, amount}] — HRA, DA, TA, etc.
  deductions JSONB,         -- [{name, amount}] — PF, TDS, loan EMI, leave deduction
  gross_salary, net_salary,
  payment_status ENUM('pending','processed','paid','held'),
  payment_date, payment_mode,
  transaction_reference,
  generated_by, approved_by,
  created_at
)
```

#### F. Classes, Sections & Subjects

```sql
classes (
  id, tenant_id, branch_id,
  name,                     -- "Nursery", "LKG", "Class 1", "Grade 10", "B.Tech Year 1"
  display_order,            -- for sorting
  class_type ENUM('playgroup','kindergarten','primary','middle','secondary',
                   'senior_secondary','undergraduate','postgraduate','coaching'),
  is_active,
  created_at
)

sections (
  id, tenant_id, branch_id, class_id,
  name,                     -- "A", "B", "C"
  capacity,
  class_teacher_id FK (staff),
  room_id FK,
  is_active,
  created_at
)

subjects (
  id, tenant_id, branch_id,
  name, code,               -- "Mathematics", "MATH-101"
  subject_type ENUM('core','elective','language','vocational','co_curricular','lab'),
  is_active,
  created_at
)

class_subjects (
  id, tenant_id,
  class_id, subject_id,
  academic_session_id,
  is_mandatory,
  weekly_periods,
  created_at
)

subject_teachers (
  id, tenant_id,
  subject_id, class_id, section_id,
  staff_id, academic_session_id,
  is_primary,               -- main teacher vs assistant
  created_at
)
```

#### G. Timetable & Periods

```sql
period_templates (
  id, tenant_id, branch_id,
  name,                     -- "Standard", "Friday Short", "Exam Day"
  periods JSONB,            -- [{period_no, start_time, end_time, type: 'class'|'break'|'assembly'|'lunch'}]
  applicable_days,          -- [1,2,3,4,5] (Mon-Fri)
  is_default,
  created_at
)

timetable_entries (
  id, tenant_id, branch_id,
  academic_session_id,
  class_id, section_id,
  day_of_week,              -- 1=Monday
  period_number,
  subject_id, staff_id,
  room_id,
  is_substitute,            -- true if covering for absent teacher
  effective_from, effective_until,
  created_at
)

substitutions (
  id, tenant_id, branch_id,
  date,
  original_staff_id, substitute_staff_id,
  timetable_entry_id,
  reason,
  arranged_by,
  created_at
)
```

#### H. Attendance (Students)

```sql
student_attendance (
  id, tenant_id, branch_id,
  student_id, class_id, section_id,
  academic_session_id,
  date,
  status ENUM('present','absent','late','half_day','excused','holiday'),
  period_wise JSONB,        -- [{period: 1, status: 'present'}, ...] for period-wise attendance
  marked_by, marked_at,
  source ENUM('manual','biometric','app','qr','rfid'),
  parent_notified,          -- auto SMS on absent
  remarks,
  created_at,
  UNIQUE(student_id, date, tenant_id)
)

attendance_settings (
  id, tenant_id, branch_id,
  attendance_type ENUM('daily','period_wise'),
  auto_notify_parent_on_absent,
  notify_after_consecutive_absents,  -- alert after N days absent
  minimum_attendance_percentage,     -- for exam eligibility
  late_threshold_minutes,
  created_at
)
```

#### I. Fee Management

```sql
fee_structures (
  id, tenant_id, branch_id,
  academic_session_id,
  name,                     -- "Standard Fee 2025-26"
  class_id,
  fee_heads JSONB,          -- [{name: 'Tuition', amount: 5000, frequency: 'monthly'},
                            --  {name: 'Lab Fee', amount: 2000, frequency: 'annual'},
                            --  {name: 'Transport', amount: 1500, frequency: 'monthly', conditional: true}]
  total_annual_amount,
  installment_plan JSONB,   -- [{name: 'Q1', due_date, amount, heads: [...]}]
  late_fee_config JSONB,    -- {type: 'fixed'|'percentage', amount, grace_days, max_late_fee}
  created_at, updated_at
)

fee_allocations (
  id, tenant_id, student_id,
  fee_structure_id,
  academic_session_id,
  allocated_amount,
  discount_id FK (nullable),
  discount_amount,
  net_amount,
  status ENUM('active','waived','transferred'),
  created_at
)

fee_discounts (
  id, tenant_id,
  name,                     -- "Sibling Discount", "Merit Scholarship", "Staff Ward"
  discount_type ENUM('percentage','fixed'),
  value,                    -- 10 (10% or ₹10 based on type)
  applicable_heads JSONB,   -- which fee heads this applies to (null = all)
  criteria JSONB,           -- auto-apply rules: {type: 'sibling', min_siblings: 2}
  max_discount_amount,      -- cap
  academic_session_id,
  is_active, created_at
)

fee_payments (
  id, tenant_id, student_id,
  fee_allocation_id,
  installment_name,         -- "Q1", "April", etc.
  amount_due, amount_paid,
  late_fee_charged, late_fee_waived,
  payment_date,
  payment_mode ENUM('cash','cheque','online','upi','bank_transfer','dd','wallet'),
  transaction_reference,
  receipt_number (unique per tenant),
  payment_gateway_id,       -- Razorpay/Stripe order ID
  status ENUM('pending','completed','partial','failed','refunded'),
  collected_by,             -- staff who collected (for cash)
  remarks,
  refund_amount, refund_reason, refunded_at,
  created_at
)

fee_reminders (
  id, tenant_id,
  student_id, parent_id,
  fee_allocation_id,
  reminder_type ENUM('upcoming','overdue','final_notice'),
  sent_via ENUM('sms','email','push','whatsapp'),
  sent_at, delivered,
  created_at
)

-- For coaching centers / colleges with flexible fee
fee_custom_plans (
  id, tenant_id, student_id,
  plan_name,
  total_amount,
  installments JSONB,      -- custom schedule per student
  approved_by,
  created_at
)
```

#### J. Examinations & Results

```sql
exam_types (
  id, tenant_id,
  name,                     -- "Unit Test 1", "Mid Term", "Final", "Pre-Board"
  weightage_percentage,     -- contribution to final grade
  academic_session_id,
  is_active, created_at
)

exams (
  id, tenant_id, branch_id,
  exam_type_id, academic_session_id,
  class_id, subject_id,
  date, start_time, end_time,
  room_id,
  max_marks, passing_marks,
  examiner_id (staff),
  syllabus_covered JSONB,   -- which chapters/topics
  status ENUM('scheduled','ongoing','completed','results_entered','results_published'),
  created_at
)

exam_results (
  id, tenant_id,
  exam_id, student_id,
  marks_obtained,
  grade,                    -- calculated based on tenant grading config
  grade_points,
  is_absent, is_exempted,
  remarks,
  entered_by, verified_by,
  created_at, updated_at
)

-- Grading system (tenant-configurable)
grading_systems (
  id, tenant_id,
  name,                     -- "CBSE", "ICSE", "Percentage", "GPA 4.0", "GPA 10.0"
  scale JSONB,              -- [{grade: 'A+', min: 90, max: 100, points: 10, description: 'Outstanding'}]
  is_default,
  created_at
)

report_cards (
  id, tenant_id, student_id,
  academic_session_id,
  class_id, section_id,
  exam_type_id,             -- null for cumulative
  subjects_data JSONB,      -- [{subject, marks, grade, remarks, teacher_remarks}]
  total_marks, percentage, grade, rank,
  attendance_summary JSONB,
  co_curricular JSONB,      -- [{activity, grade, remarks}]
  class_teacher_remarks,
  principal_remarks,
  status ENUM('draft','reviewed','published'),
  published_at,
  pdf_url,
  created_at
)
```

#### K. Syllabus & Curriculum

```sql
syllabus (
  id, tenant_id, branch_id,
  academic_session_id,
  class_id, subject_id,
  chapters JSONB,           -- [{chapter_no, title, topics: [{name, hours, description}], resources: []}]
  total_hours,
  created_by,
  approved_by, approved_at,
  created_at, updated_at
)

lesson_plans (
  id, tenant_id,
  syllabus_id,
  chapter_number, topic_name,
  planned_date,
  actual_date,
  duration_minutes,
  objectives JSONB,
  methodology,              -- lecture, activity, lab, field trip
  resources_needed,
  homework_assigned,
  status ENUM('planned','completed','skipped','rescheduled'),
  completion_notes,
  staff_id,
  created_at
)

assignments (
  id, tenant_id, branch_id,
  class_id, section_id, subject_id,
  title, description,
  assignment_type ENUM('homework','project','classwork','worksheet','online_quiz'),
  due_date,
  max_marks,
  attachments JSONB,
  assigned_by (staff_id),
  status ENUM('active','closed','graded'),
  created_at
)

assignment_submissions (
  id, assignment_id, student_id, tenant_id,
  submitted_at,
  content TEXT,
  attachments JSONB,
  marks_obtained,
  feedback,
  graded_by, graded_at,
  status ENUM('submitted','late','graded','resubmit_requested'),
  created_at
)
```

#### L. Library

```sql
library_books (
  id, tenant_id, branch_id,
  isbn, title, author, publisher,
  edition, publication_year,
  category,                 -- fiction, textbook, reference, periodical
  subject_area,
  language,
  total_copies, available_copies,
  rack_number, shelf_number,
  cover_image_url,
  is_reference_only,        -- cannot be issued
  status ENUM('active','damaged','lost','archived'),
  added_by, created_at
)

library_issues (
  id, tenant_id, branch_id,
  book_id, member_id,       -- student_id or staff_id
  member_type ENUM('student','staff'),
  issued_date, due_date,
  returned_date,
  renewed_count,
  fine_amount, fine_paid, fine_waived,
  condition_at_issue ENUM('good','fair','worn'),
  condition_at_return ENUM('good','fair','worn','damaged','lost'),
  status ENUM('issued','returned','overdue','lost'),
  issued_by, returned_to,
  created_at
)

library_settings (
  id, tenant_id, branch_id,
  max_books_student, max_books_staff,
  issue_duration_days_student, issue_duration_days_staff,
  max_renewals,
  fine_per_day,
  fine_calculation ENUM('weekdays_only','all_days'),
  created_at
)
```

#### M. Hostel

```sql
hostels (
  id, tenant_id, branch_id,
  name,                     -- "Boys Hostel A", "Girls Hostel"
  type ENUM('boys','girls','co_ed'),
  warden_id FK (staff),
  total_rooms, total_capacity,
  address JSONB,
  contact_phone,
  facilities JSONB,         -- wifi, laundry, mess, gym
  is_active, created_at
)

hostel_rooms (
  id, tenant_id, hostel_id,
  room_number, floor,
  room_type ENUM('single','double','triple','dormitory'),
  capacity, current_occupancy,
  has_attached_bathroom, has_ac,
  monthly_charge,
  status ENUM('available','occupied','full','maintenance','reserved'),
  created_at
)

hostel_allocations (
  id, tenant_id, student_id,
  hostel_id, room_id,
  bed_number,
  academic_session_id,
  check_in_date, check_out_date,
  monthly_charge,
  status ENUM('active','checked_out','transferred','expelled'),
  created_at
)

hostel_mess_menu (
  id, tenant_id, hostel_id,
  day_of_week,
  meal_type ENUM('breakfast','lunch','snacks','dinner'),
  items JSONB,
  created_at, updated_at
)

hostel_visitor_log (
  id, tenant_id, hostel_id,
  student_id,
  visitor_name, visitor_relation, visitor_phone,
  check_in_time, check_out_time,
  purpose,
  approved_by,
  created_at
)
```

#### N. Transport

```sql
transport_vehicles (
  id, tenant_id, branch_id,
  vehicle_number, vehicle_type ENUM('bus','van','auto','car'),
  capacity, driver_name, driver_phone, driver_license,
  conductor_name, conductor_phone,
  insurance_expiry, fitness_expiry, permit_expiry,
  gps_device_id,
  status ENUM('active','maintenance','retired'),
  created_at
)

transport_routes (
  id, tenant_id, branch_id,
  route_name, route_number,
  vehicle_id FK,
  stops JSONB,              -- [{stop_name, pickup_time, drop_time, lat, lng, monthly_fee}]
  total_students,
  status ENUM('active','inactive'),
  created_at
)

student_transport (
  id, tenant_id, student_id,
  route_id, stop_name,
  transport_type ENUM('pickup','drop','both'),
  monthly_fee,
  academic_session_id,
  start_date, end_date,
  status ENUM('active','discontinued'),
  created_at
)

transport_tracking (
  id, tenant_id, vehicle_id,
  lat, lng, speed,
  timestamp,
  created_at
)
```

#### O. Communication & Notifications

```sql
announcements (
  id, tenant_id, branch_id (nullable for all branches),
  title, content,
  priority ENUM('low','medium','high','urgent'),
  target_audience JSONB,    -- {roles: ['parent','student'], classes: [5,6], sections: ['A']}
  attachments JSONB,
  published_by, published_at,
  expires_at,
  is_pinned,
  requires_acknowledgment,
  created_at
)

announcement_reads (
  id, announcement_id, user_id, tenant_id,
  read_at, acknowledged_at
)

notices (
  id, tenant_id, branch_id,
  title, content,
  notice_type ENUM('circular','event','holiday','exam','meeting','general'),
  target_audience JSONB,
  valid_from, valid_until,
  attachments JSONB,
  issued_by, approved_by,
  created_at
)

messages (
  id, tenant_id,
  sender_id, sender_role,
  receiver_id, receiver_role,
  subject, body,
  attachments JSONB,
  thread_id,                -- for conversation threading
  is_read, read_at,
  is_urgent,
  created_at
)

notification_queue (
  id, tenant_id,
  user_id,
  channel ENUM('email','sms','push','whatsapp','in_app'),
  template_name,
  payload JSONB,
  status ENUM('queued','sent','delivered','failed','bounced'),
  sent_at, delivered_at,
  error_message,
  retry_count,
  created_at
)

notification_preferences (
  id, tenant_id, user_id,
  channel,
  event_type,               -- fee_reminder, attendance_alert, exam_result, etc.
  is_enabled,
  created_at
)
```

#### P. Calendar, Holidays & Events

```sql
holidays (
  id, tenant_id, branch_id (nullable),
  name, date,
  holiday_type ENUM('national','regional','religious','school_declared','weather'),
  is_optional,              -- staff may still work
  applicable_to JSONB,      -- all, specific classes, specific staff
  academic_session_id,
  created_at
)

events (
  id, tenant_id, branch_id,
  title, description,
  event_type ENUM('cultural','sports','academic','workshop','pta_meeting',
                   'annual_day','graduation','field_trip','competition','training'),
  start_date, end_date, start_time, end_time,
  venue,
  organizer_id (staff),
  target_participants JSONB,
  budget, actual_expense,
  status ENUM('planned','approved','ongoing','completed','cancelled'),
  registration_required,
  max_participants,
  attachments JSONB,
  created_at
)

event_registrations (
  id, event_id, tenant_id,
  participant_id, participant_type ENUM('student','staff','parent'),
  registered_at,
  attendance_marked,
  feedback JSONB
)
```

#### Q. Inventory & Assets

```sql
inventory_categories (
  id, tenant_id,
  name,                     -- furniture, electronics, lab_equipment, sports, stationery
  parent_category_id,       -- hierarchical
  created_at
)

inventory_items (
  id, tenant_id, branch_id,
  category_id,
  name, description,
  quantity, unit,
  minimum_stock_level,      -- alert when below
  location,                 -- room/store
  purchase_date, purchase_price,
  vendor_name, warranty_until,
  condition ENUM('new','good','fair','needs_repair','condemned'),
  asset_tag,                -- unique barcode/tag
  created_at, updated_at
)

inventory_transactions (
  id, tenant_id, item_id,
  transaction_type ENUM('purchase','issue','return','damaged','disposed','transfer'),
  quantity,
  issued_to, issued_to_type ENUM('staff','department','student'),
  remarks,
  performed_by,
  created_at
)
```

#### R. Visitor Management

```sql
visitors (
  id, tenant_id, branch_id,
  visitor_name, visitor_phone, visitor_photo_url,
  purpose ENUM('parent_visit','vendor','interview','inspection','other'),
  purpose_details,
  whom_to_meet, department,
  check_in_time, check_out_time,
  id_proof_type, id_proof_number,
  visitor_badge_number,
  pre_approved,             -- expected visit
  approved_by,
  created_at
)
```

#### S. Audit & Activity Logs

```sql
audit_logs (
  id, tenant_id,
  user_id, user_role,
  action,                   -- CREATE, UPDATE, DELETE, LOGIN, EXPORT, PRINT
  entity_type,              -- student, fee_payment, exam_result, etc.
  entity_id,
  old_values JSONB,
  new_values JSONB,
  ip_address, user_agent,
  created_at
)

login_history (
  id, user_id, tenant_id,
  ip_address, user_agent,
  device_info JSONB,
  login_at, logout_at,
  status ENUM('success','failed','blocked'),
  failure_reason
)
```

#### T. Front Office & Enquiry CRM (Pre-Admission)

```sql
enquiries (
  id, tenant_id, branch_id,
  enquiry_number (unique per tenant),
  student_name, date_of_birth, applying_for_class_id,
  parent_name, phone, email, address JSONB,
  source ENUM('walk_in','phone','website','referral','social_media','advertisement','event'),
  referred_by,              -- existing parent/staff referral tracking
  assigned_to (staff_id),   -- counselor handling this lead
  status ENUM('new','contacted','visit_scheduled','visited','application_sent',
              'applied','admitted','lost','not_interested'),
  lost_reason,              -- fees too high, distance, joined competitor, etc.
  next_follow_up_date,
  expected_admission_session_id,
  created_at, updated_at
)

enquiry_follow_ups (
  id, enquiry_id, tenant_id,
  follow_up_type ENUM('call','visit','email','sms','whatsapp'),
  notes, outcome,
  next_action, next_follow_up_date,
  performed_by, created_at
)

gate_passes (
  id, tenant_id, branch_id,
  student_id,
  pass_type ENUM('early_leave','late_arrival','half_day'),
  reason, requested_by ENUM('parent','staff'),
  authorized_pickup_person, pickup_person_id_verified,
  approved_by, issued_at, exit_time,
  created_at
)

postal_log (
  id, tenant_id, branch_id,
  direction ENUM('inward','outward'),
  reference_number, sender, recipient,
  courier_name, tracking_number,
  subject, remarks, handled_by,
  created_at
)

call_log (
  id, tenant_id, branch_id,
  direction ENUM('incoming','outgoing'),
  caller_name, phone, purpose,
  duration_minutes, notes,
  logged_by, created_at
)
```

#### U. Health & Infirmary

```sql
health_records (
  id, tenant_id, student_id,
  height_cm, weight_kg, bmi,
  vision_left, vision_right, dental_notes,
  immunizations JSONB,      -- [{vaccine, date, due_date}]
  allergies JSONB, chronic_conditions JSONB,
  emergency_instructions,   -- "carries inhaler", "epipen in office"
  recorded_by, recorded_at,
  academic_session_id       -- annual health checkup per session
)

infirmary_visits (
  id, tenant_id, branch_id,
  patient_id, patient_type ENUM('student','staff'),
  visit_time, symptoms, treatment_given,
  medicine_administered JSONB,   -- requires parent consent config
  outcome ENUM('returned_to_class','sent_home','referred_to_hospital'),
  parent_notified, parent_notified_at,
  attended_by, created_at
)

medicine_consents (
  id, tenant_id, student_id,
  medicine_name, dosage, timing,
  consent_given_by (parent_id),
  valid_from, valid_until,
  prescription_url,
  created_at
)
```

#### V. Discipline & Behavior Tracking

```sql
behavior_incidents (
  id, tenant_id, branch_id,
  student_id,
  incident_type ENUM('bullying','fighting','cheating','property_damage',
                     'attendance_fraud','dress_code','disrespect','other'),
  severity ENUM('minor','moderate','major','critical'),
  description, location, incident_date,
  witnesses JSONB,
  reported_by,
  action_taken ENUM('verbal_warning','written_warning','parent_meeting',
                    'detention','suspension','counseling_referral','expulsion'),
  parent_informed, parent_meeting_date,
  is_confidential,          -- visible only to admin + counselor
  follow_up_notes,
  created_at, updated_at
)

behavior_points (
  id, tenant_id, student_id,
  academic_session_id,
  points,                   -- positive (merit) or negative (demerit)
  category,                 -- helpfulness, leadership, misconduct
  reason, awarded_by,
  created_at
)

counseling_sessions (
  id, tenant_id, student_id,
  counselor_id (staff),
  session_date, session_type ENUM('academic','behavioral','career','personal'),
  notes_encrypted,          -- field-level encrypted; counselor + designated admin only
  follow_up_required, next_session_date,
  created_at
)
```

#### W. Canteen & Student Wallet

```sql
student_wallets (
  id, tenant_id, student_id,
  balance,                  -- minor units
  daily_spend_limit,        -- parent-configurable
  restricted_items JSONB,   -- parent can block junk food categories
  is_active, created_at, updated_at
)

wallet_transactions (
  id, tenant_id, wallet_id,
  type ENUM('topup','purchase','refund','adjustment'),
  amount, balance_after,
  reference,                -- payment gateway ref or POS sale id
  performed_by, created_at
)

canteen_items (
  id, tenant_id, branch_id,
  name, category, price, is_available,
  nutrition_tags JSONB,     -- veg, contains_nuts, junk
  created_at
)

canteen_sales (
  id, tenant_id, branch_id,
  buyer_id, buyer_type ENUM('student','staff','visitor'),
  items JSONB,              -- [{item_id, qty, price}]
  total_amount,
  payment_method ENUM('wallet','cash','upi'),
  sold_by, created_at
)
```

#### X. Alumni Management

```sql
alumni (
  id, tenant_id, student_id FK,
  passout_session_id, passout_class_id,
  current_occupation, current_organization,
  higher_education JSONB,   -- [{degree, institution, year}]
  city, country,
  linkedin_url, phone, email,
  is_contactable, is_notable,   -- featured alumni
  last_updated_by_alumni_at,
  created_at, updated_at
)

alumni_events (
  id, tenant_id, event_id FK,   -- reuses events table
  target_batch_years JSONB,
  donation_drive, donation_target, donation_collected
)

alumni_donations (
  id, tenant_id, alumni_id,
  amount, purpose, payment_reference,
  receipt_number, tax_receipt_issued,
  created_at
)
```

#### Y. Question Bank & Online Examinations (CBT)

```sql
question_bank (
  id, tenant_id,
  subject_id, class_id,
  chapter, topic,
  question_type ENUM('mcq_single','mcq_multi','true_false','fill_blank',
                     'short_answer','long_answer','match','numeric'),
  question_text, question_media JSONB,
  options JSONB,            -- [{key, text, media}]
  correct_answer JSONB,
  marks, negative_marks,
  difficulty ENUM('easy','medium','hard'),
  bloom_level,              -- remember/understand/apply/analyze
  tags JSONB,
  created_by, reviewed_by, is_approved,
  usage_count,              -- how many times used in papers
  created_at
)

online_exams (
  id, tenant_id, branch_id,
  exam_id FK (nullable),    -- can link to offline exam record
  title, class_id, subject_id,
  question_selection ENUM('manual','random_from_pool','sectioned'),
  sections JSONB,           -- [{name, question_ids|pool_criteria, marks, duration}]
  total_marks, duration_minutes,
  scheduled_start, scheduled_end,
  allow_late_entry_minutes,
  shuffle_questions, shuffle_options,
  show_result ENUM('immediately','after_end','manual'),
  proctoring JSONB,         -- {tab_switch_limit, webcam_snapshots, fullscreen_forced}
  status ENUM('draft','published','ongoing','completed','results_out'),
  created_by, created_at
)

online_exam_attempts (
  id, tenant_id, online_exam_id, student_id,
  started_at, submitted_at,
  answers JSONB,            -- [{question_id, answer, time_spent, marked_for_review}]
  auto_score, manual_score, total_score,
  tab_switches, warnings_issued,
  status ENUM('in_progress','submitted','auto_submitted','disqualified','evaluated'),
  graded_by, created_at
)

exam_seating_plans (
  id, tenant_id, branch_id,
  exam_schedule_id,
  room_id, layout JSONB,    -- [{seat_no, student_id, admission_no}]
  mixing_strategy,          -- alternate classes to prevent copying
  generated_at, generated_by
)

invigilation_duties (
  id, tenant_id, branch_id,
  exam_id, room_id, staff_id,
  duty_date, shift,
  status ENUM('assigned','accepted','swapped','completed'),
  swapped_with, created_at
)
```

#### Z. Coaching Center: Batches, Courses & Test Series

```sql
courses (
  id, tenant_id, branch_id,
  name,                     -- "JEE 2-Year Program", "NEET Crash Course", "Spoken English"
  code, description,
  duration_months, total_fee,
  target_exam,              -- JEE, NEET, UPSC, SSC, IELTS
  subjects JSONB,
  is_active, created_at
)

batches (
  id, tenant_id, branch_id,
  course_id,
  name,                     -- "Morning Batch A", "Weekend Batch"
  start_date, end_date,
  schedule JSONB,           -- [{day, start_time, end_time, subject_id}]
  capacity, current_strength,
  primary_faculty_id,
  room_id,
  status ENUM('upcoming','ongoing','completed','merged','cancelled'),
  created_at
)

batch_enrollments (
  id, tenant_id, student_id, batch_id,
  enrolled_at, valid_until,
  status ENUM('active','completed','dropped','transferred','frozen'),
  freeze_history JSONB,     -- student pauses course, validity extended
  created_at
)

test_series (
  id, tenant_id,
  course_id, name,
  tests JSONB,              -- [{test_no, online_exam_id, date, syllabus}]
  is_purchasable_standalone, standalone_price,
  created_at
)

demo_classes (
  id, tenant_id, branch_id,
  enquiry_id FK, batch_id,
  scheduled_date, attended,
  feedback, converted_to_enrollment,
  created_at
)
```

#### AA. College / Higher-Ed: Programs, Semesters & Credits

```sql
programs (
  id, tenant_id, branch_id,
  name,                     -- "B.Sc Computer Science", "Diploma in Nursing"
  degree_level ENUM('certificate','diploma','undergraduate','postgraduate','doctoral'),
  department_id,
  duration_semesters, total_credits_required,
  accreditation_body,       -- UGC, AICTE
  is_active, created_at
)

semesters (
  id, tenant_id, program_id,
  semester_number,
  academic_session_id,
  start_date, end_date,
  registration_open, registration_deadline,
  created_at
)

course_units (
  id, tenant_id, program_id,
  code, name,               -- "CS-301 Data Structures"
  credits, semester_number,
  unit_type ENUM('core','elective','open_elective','lab','project','internship'),
  prerequisites JSONB,      -- [course_unit_ids]
  max_seats,                -- for electives
  created_at
)

student_registrations (
  id, tenant_id, student_id,
  semester_id, course_unit_id,
  registration_type ENUM('regular','backlog','improvement','audit'),
  status ENUM('registered','dropped','completed','failed'),
  grade, grade_points, credits_earned,
  attempt_number,
  created_at
)

-- GPA/CGPA computed per semester from student_registrations
-- Backlog tracking: registration_type='backlog' + attempt_number
```

#### AB. Playschool / Daycare Extensions

```sql
daycare_logs (
  id, tenant_id, branch_id, student_id,
  date,
  meals JSONB,              -- [{meal, ate: 'all'|'some'|'none', notes}]
  nap JSONB,                -- [{start, end, quality}]
  diaper_changes JSONB,     -- [{time, type}]
  mood ENUM('happy','normal','fussy','sick'),
  activities JSONB,         -- [{activity, participation, photo_urls}]
  incidents,                -- minor bumps, shared with parent
  supplies_needed,          -- "diapers running low"
  logged_by, shared_with_parent_at,
  created_at
)

pickup_authorizations (
  id, tenant_id, student_id,
  person_name, relation, phone,
  photo_url, id_proof_url,
  is_permanent,             -- vs one-time authorization
  valid_date,               -- for one-time
  authorized_by (parent_id),
  created_at
)

pickup_log (
  id, tenant_id, student_id,
  date, picked_up_at,
  picked_up_by, authorization_id FK,
  verified_by (staff), verification_method ENUM('photo_match','otp','id_check'),
  created_at
)

milestone_tracking (
  id, tenant_id, student_id,
  milestone_category ENUM('motor','language','social','cognitive','self_help'),
  milestone, achieved_date,
  observation_notes, photo_urls JSONB,
  recorded_by, created_at
)
```

---

## 5. Authentication & Authorization

### Auth Flow

```
Login → email/phone + password → JWT (access + refresh tokens)
     → MFA check (if enabled) → TOTP/SMS OTP
     → Token contains: {user_id, tenant_id, branch_id, role, permissions}

Session Management:
- Access token: 15 min TTL (stored in memory/httpOnly cookie)
- Refresh token: 7 days TTL (stored in Redis, httpOnly cookie)
- Concurrent session limit: configurable per tenant
- Force logout capability for admins
```

### Permission System (RBAC + ABAC Hybrid)

```
Level 1: Role-Based (RBAC)
  - super_admin → full platform access
  - tenant_admin → full tenant access
  - branch_admin → full branch access
  - teacher → class/subject specific access
  - accountant → fee module access
  - librarian → library module access
  - parent → own children data only
  - student → own data only

Level 2: Attribute-Based (ABAC)
  - Teacher can only edit marks for their assigned classes/subjects
  - Parent can only view their linked children
  - Branch admin cannot see other branch data
  - Accountant cannot modify student records

Level 3: Custom Roles
  - Tenant admin can create custom roles with specific permissions
  - E.g., "Head of Department" = teacher + staff_view + leave_approve
```

### Permission Granularity

```
module.resource.action

Examples:
- student.profile.view
- student.profile.edit
- student.profile.delete
- fee.payment.collect
- fee.payment.refund
- fee.structure.create
- exam.result.enter
- exam.result.publish
- exam.result.view_all
- exam.result.view_own (parent/student)
- attendance.mark
- attendance.view_report
- library.book.issue
- library.book.return
- hostel.room.allocate
- transport.route.manage
- announcement.create
- announcement.approve
- report.generate
- report.export
- settings.manage
- user.create
- user.deactivate
```

---

## 6. Module Breakdown

### Module 1: Platform Administration (Super Admin)

**Who uses it**: Schoolmate team (us)

| Feature                | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| Tenant onboarding      | Create new tenant, configure plan, set limits         |
| Tenant management      | View all tenants, usage stats, suspend/activate       |
| Subscription & billing | Plan management, invoice generation, payment tracking |
| Customization requests | Track and deploy tenant-specific customizations       |
| Platform analytics     | Total users, revenue, growth metrics, MRR/ARR         |
| Tenant impersonation   | Login as tenant admin for support (with audit trail)  |
| System health          | Server metrics, error rates, slow queries             |
| Feature flags          | Enable/disable features per tenant or globally        |
| Email/SMS templates    | Manage notification templates                         |
| Support tickets        | View and respond to tenant support requests           |

### Module 2: Tenant Administration

**Who uses it**: School admin/management

| Feature                | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| Branch management      | Add/edit branches, configure branch-specific settings      |
| Academic session setup | Create sessions, define terms/semesters                    |
| Class & section config | Create classes, sections, assign class teachers            |
| Subject management     | Create subjects, assign to classes, map teachers           |
| Fee structure creation | Define fee heads, installment plans, late fee rules        |
| Grading system config  | Choose/customize grading scale                             |
| User management        | Create staff/teacher accounts, assign roles                |
| Custom role creation   | Define roles with specific permissions                     |
| School branding        | Logo, theme colors, custom domain                          |
| Report templates       | Customize report card layout, certificate templates        |
| Import/Export          | Bulk import students/staff from Excel/CSV                  |
| Dashboard              | School-wide KPIs, attendance trends, fee collection status |
| Audit trail            | View all actions performed by users                        |

### Module 3: Admission Management

**Who uses it**: Admission staff, admin

| Feature                  | Description                                                                 |
| ------------------------ | --------------------------------------------------------------------------- |
| Online admission form    | Configurable dynamic form per class                                         |
| Application tracking     | Status pipeline: applied → reviewed → test → interview → offered → accepted |
| Entrance test management | Schedule tests, record scores                                               |
| Document upload          | Required documents checklist with verification                              |
| Waitlist management      | Auto-notify when seat available                                             |
| Merit list generation    | Auto-rank by criteria (marks, interview, etc.)                              |
| Conversion to student    | One-click convert accepted application to student record                    |
| Admission analytics      | Applications by class, conversion rates, demographics                       |
| Re-admission             | Simplified process for returning students                                   |

### Module 4: Student Management

**Who uses it**: Admin, teachers, students, parents

| Feature            | Description                                                 |
| ------------------ | ----------------------------------------------------------- |
| Student profile    | Complete profile with photo, documents, medical info        |
| Class allocation   | Assign to class/section, roll number                        |
| Promotion/demotion | Bulk promote/detain with criteria                           |
| Transfer           | Generate TC, mark as transferred                            |
| Alumni tracking    | Maintain alumni records                                     |
| Sibling linking    | Link siblings for fee discount auto-application             |
| Student timeline   | Chronological view of all student activities                |
| ID card generation | Auto-generate student ID cards with QR code                 |
| Bulk operations    | Import, export, bulk update class/section                   |
| Student search     | Advanced search with filters (class, section, status, etc.) |

### Module 5: Staff / HR Management

**Who uses it**: Admin, HR, staff

| Feature               | Description                                           |
| --------------------- | ----------------------------------------------------- |
| Staff profile         | Complete profile with qualifications, documents       |
| Department management | Create departments, assign HODs                       |
| Designation hierarchy | Define designations and reporting structure           |
| Staff attendance      | Daily attendance via biometric/app/manual             |
| Leave management      | Apply, approve/reject, leave balance tracking         |
| Leave calendar        | Visual calendar showing staff availability            |
| Payroll processing    | Monthly salary calculation with allowances/deductions |
| Payslip generation    | PDF payslips with breakup                             |
| Tax computation       | TDS calculation, Form 16 data                         |
| Contract management   | Track contract staff terms, renewal alerts            |
| Performance review    | Annual appraisal forms, goal tracking                 |
| Staff timetable       | Individual teacher's schedule view                    |
| Workload analysis     | Teaching hours per teacher, fair distribution         |

### Module 6: Attendance Management

**Who uses it**: Teachers, admin, parents

| Feature                   | Description                                         |
| ------------------------- | --------------------------------------------------- |
| Daily attendance          | Mark attendance for entire class in one screen      |
| Period-wise attendance    | Attendance per period (for higher classes)          |
| Biometric integration     | API for biometric device sync                       |
| QR code attendance        | Students scan QR to mark attendance (with GPS)      |
| RFID/Smart card           | Support for RFID-based attendance                   |
| Parent notification       | Auto-SMS on absent (configurable)                   |
| Attendance reports        | Daily, weekly, monthly, cumulative                  |
| Attendance shortage alert | Flag students below minimum %                       |
| Exam eligibility          | Auto-check attendance criteria for exam eligibility |
| Late arrival tracking     | Track and report habitual late comers               |

### Module 7: Fee Management

**Who uses it**: Accountant, admin, parents

| Feature                   | Description                                                 |
| ------------------------- | ----------------------------------------------------------- |
| Fee structure setup       | Class-wise fee heads, amounts, frequencies                  |
| Installment plans         | Flexible installment schedules                              |
| Fee allocation            | Auto-assign fee structure to students                       |
| Fee collection            | Cash/cheque/online payment recording                        |
| Online payment gateway    | Razorpay/Stripe integration for parent self-pay             |
| Receipt generation        | Auto-numbered receipts with PDF download                    |
| Late fee auto-calculation | Based on configured rules                                   |
| Discount management       | Sibling, merit, staff-ward, category-based discounts        |
| Fee concession            | Partial fee waiver with approval workflow                   |
| Fee defaulter reports     | List of students with pending fees                          |
| Payment reminders         | Automated SMS/email reminders before/after due date         |
| Refund processing         | Track refunds with approval                                 |
| Financial reports         | Collection reports, outstanding reports, head-wise analysis |
| Export to Tally           | Integration with accounting software                        |
| Consolidated fee receipt  | Combined receipt for siblings                               |

### Module 8: Examination & Results

**Who uses it**: Teachers, exam coordinator, admin, students, parents

| Feature                | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| Exam scheduling        | Create exams, assign dates, rooms, invigilators      |
| Datesheet generation   | Auto-generate exam timetable avoiding conflicts      |
| Hall ticket generation | PDF hall tickets with seat numbers                   |
| Marks entry            | Subject teacher enters marks (restricted access)     |
| Marks verification     | HOD/admin verifies before publishing                 |
| Auto-grading           | Calculate grades based on configured grading system  |
| Report card generation | Cumulative report cards with all exam types          |
| Rank generation        | Class rank, section rank, overall rank               |
| Subject-wise analysis  | Average, highest, lowest, pass %, distribution chart |
| Comparative analysis   | Compare across sections, branches, sessions          |
| Result publishing      | Controlled publishing (date/time based)              |
| Parent access          | Parents view results via portal/app                  |
| Board exam management  | External exam registration tracking                  |
| Custom assessments     | Co-curricular, life skills, behavior grades          |

### Module 9: Timetable Management

**Who uses it**: Admin, timetable coordinator, teachers

| Feature                 | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| Period configuration    | Define period timings, breaks, assembly                |
| Auto-generation         | Algorithm-based timetable generation with constraints  |
| Constraint handling     | Teacher availability, room capacity, subject conflicts |
| Substitution management | Quick assignment of substitute teachers                |
| Teacher view            | Individual teacher's weekly schedule                   |
| Class view              | Section-wise weekly timetable                          |
| Room view               | Room availability and usage                            |
| Conflict detection      | Flag double-booking of teachers/rooms                  |
| Print/Export            | PDF timetable for notice boards                        |
| Effective dating        | Schedule changes for future dates                      |

### Module 10: Library Management

**Who uses it**: Librarian, students, staff

| Feature            | Description                                         |
| ------------------ | --------------------------------------------------- |
| Book catalog       | Add books with ISBN auto-fill, categories, barcodes |
| Book search        | Search by title, author, ISBN, category             |
| Book issue/return  | Scan barcode to issue/return                        |
| Fine management    | Auto-calculate overdue fines                        |
| Renewal            | Online renewal by students/staff                    |
| Reservation        | Reserve books that are currently issued             |
| Digital library    | Upload and share e-books, PDFs                      |
| Reading history    | Track student reading habits                        |
| Stock audit        | Annual stock verification workflow                  |
| New arrivals       | Display newly added books                           |
| Reports            | Most issued, overdue, category-wise stats           |
| Barcode generation | Print barcode labels for books                      |
| Budget tracking    | Library purchase budget management                  |

### Module 11: Hostel Management

**Who uses it**: Hostel warden, admin, parents, students

| Feature                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| Hostel & room setup    | Define hostels, floors, rooms, bed capacity       |
| Room allocation        | Assign students to rooms/beds                     |
| Occupancy dashboard    | Visual floor plan with occupancy status           |
| Mess menu management   | Weekly menu planning and display                  |
| Mess attendance        | Track daily mess usage                            |
| Visitor log            | Record visitor details with check-in/out times    |
| Complaints/Requests    | Student can raise room maintenance requests       |
| Hostel fee integration | Linked to fee module                              |
| Leave/Outing requests  | Students request permission to leave hostel       |
| Parent notification    | Alert parents when student leaves/returns         |
| Room change management | Track room transfers                              |
| Hostel rules           | Display rules and acknowledgment                  |
| Emergency contacts     | Quick access to all hostelers' emergency contacts |

### Module 12: Transport Management

**Who uses it**: Transport manager, admin, parents

| Feature                   | Description                                       |
| ------------------------- | ------------------------------------------------- |
| Vehicle management        | Register vehicles, track documents/expiry         |
| Route planning            | Define routes with stops, timings, fees           |
| Student mapping           | Assign students to routes/stops                   |
| Driver management         | Driver profiles, license tracking                 |
| GPS tracking              | Real-time vehicle location (via GPS device API)   |
| Parent app tracking       | Parents see bus location on map                   |
| Arrival notifications     | Auto-notify parents when bus is approaching       |
| Transport fee integration | Linked to fee module                              |
| Route optimization        | Suggest optimal routes based on student locations |
| Vehicle maintenance log   | Track servicing, repairs, fuel                    |
| Document expiry alerts    | Insurance, fitness, permit renewal reminders      |

### Module 13: Communication Hub

**Who uses it**: All users

| Feature              | Description                                     |
| -------------------- | ----------------------------------------------- |
| Announcements        | Broadcast to specific audience groups           |
| Circulars/Notices    | Official circulars with acknowledgment tracking |
| In-app messaging     | Teacher ↔ Parent, Admin ↔ Staff messaging       |
| SMS integration      | Bulk SMS, automated alerts                      |
| Email integration    | Transactional and bulk emails                   |
| Push notifications   | Mobile app push notifications                   |
| WhatsApp integration | WhatsApp Business API for notifications         |
| Notice board         | Digital notice board on dashboard               |
| Emergency alerts     | One-click emergency broadcast to all parents    |
| Communication logs   | Track all sent communications                   |
| Feedback collection  | Surveys and feedback forms                      |

### Module 14: Syllabus & Lesson Planning

**Who uses it**: Teachers, HODs, admin

| Feature               | Description                                   |
| --------------------- | --------------------------------------------- |
| Syllabus definition   | Chapter-wise syllabus with topics             |
| Lesson plan creation  | Daily/weekly lesson plans by teachers         |
| Lesson plan review    | HOD reviews and approves plans                |
| Progress tracking     | Track syllabus completion percentage          |
| Resource linking      | Link materials, videos, references to topics  |
| Homework/Assignments  | Create and distribute assignments             |
| Assignment submission | Online submission by students                 |
| Grading assignments   | Teacher grades and provides feedback          |
| Digital content       | Upload/link educational resources per chapter |

### Module 15: Calendar & Events

**Who uses it**: All users

| Feature                 | Description                                     |
| ----------------------- | ----------------------------------------------- |
| Academic calendar       | Full year view with all events, exams, holidays |
| Holiday management      | Define holidays with types                      |
| Event planning          | Create events with registration, budget         |
| Parent-teacher meetings | Schedule PTM slots, parent booking              |
| Training/Workshops      | Staff training events with attendance           |
| Event gallery           | Photo/video gallery per event                   |
| Birthday reminders      | Auto-reminders for student/staff birthdays      |
| Integration             | Sync with Google Calendar / iCal                |

### Module 16: Reports & Analytics

**Who uses it**: Admin, management, teachers

| Feature               | Description                                  |
| --------------------- | -------------------------------------------- |
| Student reports       | Attendance, academic performance, fee status |
| Staff reports         | Attendance, leave balance, payroll           |
| Financial reports     | Revenue, outstanding, collection efficiency  |
| Academic reports      | Pass %, subject analysis, comparative        |
| Custom report builder | Drag-drop report builder with filters        |
| Government reports    | UDISE, RTE compliance reports (India)        |
| Export formats        | PDF, Excel, CSV                              |
| Dashboard widgets     | Configurable dashboard with charts           |
| Scheduled reports     | Auto-email reports on schedule               |
| Data visualization    | Charts, graphs, heatmaps                     |

### Module 17: Inventory & Assets

**Who uses it**: Admin, store manager

| Feature           | Description                         |
| ----------------- | ----------------------------------- |
| Item catalog      | Categories, items, quantities       |
| Stock management  | Track additions, issues, returns    |
| Low stock alerts  | Automatic alerts when below minimum |
| Asset tracking    | Fixed asset register with tags      |
| Issue/Return      | Track who has what equipment        |
| Purchase requests | Staff can request items             |
| Vendor management | Vendor database, purchase history   |
| Audit trail       | Complete transaction history        |

### Module 18: Visitor Management

**Who uses it**: Receptionist, security, admin

| Feature                   | Description                            |
| ------------------------- | -------------------------------------- |
| Visitor registration      | Quick check-in with ID, photo, purpose |
| Pre-approved visitors     | Schedule expected visitors             |
| Badge printing            | Print visitor badges                   |
| Whom-to-meet notification | Alert staff when visitor arrives       |
| Visitor history           | Search past visitor records            |
| Blacklist                 | Flag restricted visitors               |
| Analytics                 | Visitor frequency, peak hours          |

### Module 19: Parent Portal

**Who uses it**: Parents

| Feature                  | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| Dashboard                | Child's attendance, upcoming exams, pending fees at a glance |
| Attendance view          | Daily attendance status with reason for absence              |
| Fee payment              | Online fee payment, receipt download                         |
| Exam results             | View results, report cards, progress graphs                  |
| Timetable view           | Child's class timetable                                      |
| Homework view            | Pending assignments, submission status                       |
| Communicate              | Message teachers, view circulars                             |
| Transport tracking       | Track school bus in real-time                                |
| Apply for leave          | Submit student leave application                             |
| PTM booking              | Book parent-teacher meeting slots                            |
| Documents                | Download report cards, certificates, receipts                |
| Multiple children        | Switch between children (single parent login)                |
| Notification preferences | Configure what notifications to receive                      |

### Module 20: Student Portal

**Who uses it**: Students

| Feature      | Description                                         |
| ------------ | --------------------------------------------------- |
| Dashboard    | Today's timetable, pending homework, upcoming exams |
| Attendance   | View own attendance percentage                      |
| Exam results | View marks, grades, report cards                    |
| Assignments  | View homework, submit online                        |
| Library      | Search books, view issued books, request renewal    |
| Timetable    | Personal timetable                                  |
| Syllabus     | View syllabus, track completion                     |
| Notices      | View relevant announcements                         |
| Profile      | View/edit permitted profile fields                  |
| Certificates | Request bonafide, character certificates            |

### Module 21: Online Learning (Add-on Module)

**Who uses it**: Teachers, students

| Feature                | Description                                     |
| ---------------------- | ----------------------------------------------- |
| Virtual classroom      | Zoom/Meet integration for live classes          |
| Recorded lectures      | Upload/stream pre-recorded content              |
| Online quizzes         | Create MCQ/subjective quizzes with auto-grading |
| Study material sharing | Upload notes, presentations per chapter         |
| Discussion forum       | Topic-wise discussion threads                   |
| Video library          | Organized by class, subject, chapter            |

### Module 22: Certificate & Document Generation

**Who uses it**: Admin, students, parents

| Feature                | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| Bonafide certificate   | Auto-generate with student details                    |
| Character certificate  | Template-based generation                             |
| Transfer certificate   | Generate TC with all required fields                  |
| Experience certificate | For departing staff                                   |
| Custom certificates    | Achievement, participation, sports                    |
| ID cards               | Student/staff ID cards with QR/barcode                |
| Template management    | Customizable templates per tenant                     |
| Bulk generation        | Generate certificates for entire class                |
| QR verification        | QR code on certificates for authenticity verification |

### Module 23: Complaint & Ticket Management

**Who uses it**: All users

| Feature              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| Raise complaint      | Any user can raise issues                                |
| Categories           | Academic, infrastructure, bullying, fee, transport, food |
| Assignment           | Auto/manual assign to responsible staff                  |
| Escalation           | Auto-escalate if not resolved in time                    |
| Status tracking      | Submitter can track resolution progress                  |
| Anonymous complaints | Option for anonymous submission                          |
| Resolution feedback  | Rating after resolution                                  |
| Reports              | Complaint trends, resolution time, categories            |

### Module 24: Front Office & Enquiry CRM

**Who uses it**: Receptionist, admission counselors, admin

| Feature                 | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| Enquiry capture         | Walk-in, phone, website form, social media leads in one pipeline |
| Lead assignment         | Auto/manual assign to counselors with workload balancing         |
| Follow-up scheduler     | Reminders for due follow-ups; overdue escalation to admin        |
| Conversion funnel       | Enquiry → visit → application → admission with stage analytics   |
| Lost-lead analysis      | Track why leads drop (fees, distance, competitor)                |
| Referral tracking       | Which parents/staff bring admissions; referral rewards           |
| Website widget          | Embeddable enquiry form for the school's own website             |
| Gate pass management    | Early leave / late arrival passes with pickup verification       |
| Postal & call registers | Inward/outward mail and call logs (front-desk workflows)         |
| Season dashboards       | Admission-season funnel, counselor performance, source ROI       |

### Module 25: Health & Infirmary

**Who uses it**: School nurse, admin, parents

| Feature                   | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| Annual health records     | Height, weight, BMI, vision, dental per session; growth charts |
| Immunization tracker      | Vaccine records with due-date alerts to parents                |
| Infirmary visit log       | Symptoms, treatment, outcome, auto parent notification         |
| Medicine consent          | Parents authorize specific medicines with prescriptions        |
| Allergy & condition flags | Surfaced on student profile, canteen POS, and trip rosters     |
| Epidemic monitoring       | Spike detection in similar symptoms across classes             |
| Referral tracking         | Hospital referrals with follow-up status                       |

### Module 26: Discipline, Behavior & Counseling

**Who uses it**: Teachers, counselors, admin, parents (limited view)

| Feature                | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| Incident logging       | Severity-graded incidents with witnesses and evidence            |
| Action workflow        | Warning → parent meeting → detention → suspension with approvals |
| Merit/demerit points   | House points, positive behavior reinforcement, leaderboards      |
| Counseling case notes  | Encrypted notes visible only to counselor + designated admin     |
| Anti-bullying protocol | Confidential reporting channel, mandatory escalation rules       |
| Pattern detection      | Repeat-offender alerts; correlation with attendance/grades       |
| Parent communication   | Configurable visibility of incidents to parents                  |

### Module 27: Canteen & Student Wallet

**Who uses it**: Canteen staff, parents, students, accountant

| Feature            | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| Cashless wallet    | Parent tops up online; student pays via ID card/QR            |
| Parental controls  | Daily spend limit, blocked item categories (junk food)        |
| POS billing        | Fast item-grid POS for canteen counter                        |
| Allergy guard      | POS warns when student buys item matching their allergy flags |
| Spend visibility   | Parents see what child bought, when                           |
| Menu & pricing     | Item catalog with availability, nutrition tags                |
| Settlement reports | Daily sales, wallet float reconciliation                      |

### Module 28: Alumni Management

**Who uses it**: Admin, alumni coordinator, alumni

| Feature             | Description                                            |
| ------------------- | ------------------------------------------------------ |
| Auto-conversion     | Passout students become alumni records automatically   |
| Alumni portal       | Self-service profile updates, batch directories        |
| Reunions & events   | Batch-targeted event invites via events module         |
| Donation drives     | Collect donations with receipts and tax documentation  |
| Notable alumni      | Feature achievers on school website/marketing          |
| Career network      | Alumni offer internships/mentoring to current students |
| Transcript requests | Alumni request documents online with paid processing   |

### Module 29: Question Bank & Online Exams (CBT)

**Who uses it**: Teachers, exam coordinators, students

| Feature               | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| Question bank         | Tagged by subject/chapter/difficulty/Bloom level, review workflow       |
| Paper generation      | Auto-generate papers from pool by blueprint (marks distribution)        |
| Online exams          | Timed CBT with sections, shuffling, negative marking                    |
| Proctoring            | Tab-switch detection, fullscreen enforcement, optional webcam snapshots |
| Auto + manual grading | MCQs auto-graded; subjective answers routed to teachers                 |
| Seating plans         | Auto seat allocation mixing classes to prevent copying                  |
| Invigilation duties   | Duty roster with swap requests                                          |
| OMR support           | Printable OMR sheets + scan-based evaluation for offline MCQ tests      |
| Analytics             | Item analysis: which questions most students got wrong                  |

### Module 30: Coaching Center Suite (Vertical)

**Who uses it**: Coaching institutes, tuition centers

| Feature           | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| Courses & batches | Course catalog, batch scheduling, capacity, faculty mapping               |
| Batch lifecycle   | Merge under-filled batches, freeze/resume enrollment (validity extension) |
| Demo classes      | Free demo scheduling linked to enquiry CRM; conversion tracking           |
| Test series       | Standalone-purchasable mock test packages (JEE/NEET/UPSC style)           |
| Rank prediction   | Percentile vs all test-takers across the institute                        |
| Doubt sessions    | Book 1:1 or group doubt-clearing slots with faculty                       |
| Study material    | Chapter-wise PDFs/videos gated by enrollment                              |
| Multi-enrollment  | One student in multiple courses with separate fee plans                   |

### Module 31: Higher-Ed Suite (Vertical)

**Who uses it**: Colleges, degree/diploma institutes

| Feature                     | Description                                              |
| --------------------------- | -------------------------------------------------------- |
| Programs & departments      | Degree programs with accreditation metadata              |
| Semester system             | Semester-wise sessions, registration windows             |
| Credit & GPA engine         | Credits, SGPA/CGPA computation, transcripts              |
| Elective registration       | Seat-limited elective selection with prerequisites check |
| Backlog management          | Re-registration for failed units, attempt tracking       |
| Internship/project tracking | Credit-bearing internships with supervisor evaluation    |
| Convocation                 | Degree issuance records, transcript generation           |

---

## 7. API Design

### API Conventions

```
Base URL: https://api.schoolmate.app/v1

Authentication: Bearer JWT token
Tenant Resolution: From JWT or X-Tenant-ID header

Pagination: ?page=1&limit=20 → returns { data: [], meta: { total, page, limit, totalPages } }
Sorting: ?sort=created_at&order=desc
Filtering: ?status=active&class_id=uuid
Search: ?q=search_term

Rate Limiting: 100 req/min per user, 1000 req/min per tenant

Response Format:
{
  "success": true,
  "data": { ... },
  "meta": { ... }
}

Error Format:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": [{ "field": "email", "message": "Invalid email" }]
  }
}
```

### Key API Endpoints (Representative)

```
# Auth
POST   /auth/login
POST   /auth/register
POST   /auth/refresh
POST   /auth/forgot-password
POST   /auth/reset-password
POST   /auth/verify-otp
DELETE /auth/logout

# Tenant Management (Super Admin)
POST   /admin/tenants
GET    /admin/tenants
GET    /admin/tenants/:id
PATCH  /admin/tenants/:id
POST   /admin/tenants/:id/suspend
POST   /admin/tenants/:id/activate
GET    /admin/tenants/:id/usage

# Branches
POST   /branches
GET    /branches
GET    /branches/:id
PATCH  /branches/:id

# Students
POST   /students
GET    /students
GET    /students/:id
PATCH  /students/:id
POST   /students/bulk-import
POST   /students/promote
GET    /students/:id/timeline
GET    /students/:id/fee-status
GET    /students/:id/attendance

# Staff
POST   /staff
GET    /staff
GET    /staff/:id
PATCH  /staff/:id
GET    /staff/:id/timetable
GET    /staff/:id/attendance

# Attendance
POST   /attendance/students/mark
GET    /attendance/students/daily
GET    /attendance/students/:id/report
POST   /attendance/staff/mark
GET    /attendance/staff/daily

# Fees
POST   /fees/structures
GET    /fees/structures
POST   /fees/allocate
POST   /fees/collect
GET    /fees/payments
GET    /fees/defaulters
POST   /fees/reminders/send
GET    /fees/reports/collection

# Exams
POST   /exams
GET    /exams
POST   /exams/:id/marks
GET    /exams/:id/results
POST   /exams/:id/publish
GET    /report-cards/:studentId

# Timetable
POST   /timetable/generate
GET    /timetable/class/:classId/section/:sectionId
GET    /timetable/teacher/:staffId
POST   /timetable/substitution

# Library
GET    /library/books
POST   /library/books
POST   /library/issue
POST   /library/return
GET    /library/overdue

# Hostel
GET    /hostel/rooms
POST   /hostel/allocate
GET    /hostel/occupancy
POST   /hostel/visitor

# Transport
GET    /transport/routes
POST   /transport/routes
GET    /transport/tracking/:vehicleId

# Communication
POST   /announcements
GET    /announcements
POST   /messages
GET    /messages/inbox
GET    /messages/thread/:threadId
POST   /notifications/send

# Reports
GET    /reports/attendance
GET    /reports/fee-collection
GET    /reports/academic-performance
POST   /reports/custom
GET    /reports/export/:format
```

---

## 8. Frontend Architecture

### Route Structure (Next.js App Router)

```
app/
├── (marketing)/              # Public marketing site
│   ├── page.tsx              # Landing page
│   ├── pricing/
│   ├── features/
│   └── contact/
│
├── (auth)/                   # Auth pages
│   ├── login/
│   ├── register/
│   ├── forgot-password/
│   └── verify-otp/
│
├── (platform-admin)/         # Super Admin (schoolmate team)
│   └── admin/
│       ├── dashboard/
│       ├── tenants/
│       ├── billing/
│       ├── features/
│       └── support/
│
├── (tenant)/                 # Tenant-scoped pages
│   └── [tenant-slug]/        # Dynamic tenant routing
│       ├── dashboard/
│       ├── students/
│       │   ├── page.tsx      # List
│       │   ├── [id]/         # Student detail
│       │   ├── admissions/
│       │   └── import/
│       ├── staff/
│       │   ├── page.tsx
│       │   ├── [id]/
│       │   ├── attendance/
│       │   ├── leaves/
│       │   └── payroll/
│       ├── academics/
│       │   ├── classes/
│       │   ├── subjects/
│       │   ├── timetable/
│       │   ├── syllabus/
│       │   └── assignments/
│       ├── examinations/
│       │   ├── schedule/
│       │   ├── marks-entry/
│       │   ├── results/
│       │   └── report-cards/
│       ├── attendance/
│       │   ├── mark/
│       │   └── reports/
│       ├── fees/
│       │   ├── structure/
│       │   ├── collection/
│       │   ├── payments/
│       │   ├── discounts/
│       │   └── reports/
│       ├── library/
│       │   ├── catalog/
│       │   ├── issue-return/
│       │   └── reports/
│       ├── hostel/
│       │   ├── rooms/
│       │   ├── allocation/
│       │   └── mess/
│       ├── transport/
│       │   ├── routes/
│       │   ├── vehicles/
│       │   └── tracking/
│       ├── communication/
│       │   ├── announcements/
│       │   ├── notices/
│       │   ├── messages/
│       │   └── sms-email/
│       ├── calendar/
│       ├── inventory/
│       ├── visitors/
│       ├── complaints/
│       ├── certificates/
│       ├── reports/
│       │   ├── academic/
│       │   ├── financial/
│       │   ├── attendance/
│       │   └── custom/
│       └── settings/
│           ├── general/
│           ├── branches/
│           ├── academic-session/
│           ├── roles-permissions/
│           ├── grading/
│           ├── fee-config/
│           ├── notification/
│           ├── branding/
│           └── integrations/
│
├── (parent-portal)/          # Parent-specific portal
│   └── parent/
│       ├── dashboard/
│       ├── children/[id]/
│       ├── fees/
│       ├── attendance/
│       ├── results/
│       ├── messages/
│       └── transport/
│
└── (student-portal)/         # Student-specific portal
    └── student/
        ├── dashboard/
        ├── attendance/
        ├── results/
        ├── assignments/
        ├── library/
        ├── timetable/
        └── notices/
```

### Frontend Tech Stack

| Concern       | Library                                         |
| ------------- | ----------------------------------------------- |
| UI Components | shadcn/ui + Tailwind CSS                        |
| Forms         | React Hook Form + Zod                           |
| State         | Zustand (client) + TanStack Query (server)      |
| Tables        | TanStack Table (sorting, filtering, pagination) |
| Charts        | Recharts                                        |
| Calendar      | FullCalendar                                    |
| Rich Text     | Tiptap                                          |
| PDF Viewer    | react-pdf                                       |
| Date Handling | date-fns                                        |
| Drag & Drop   | dnd-kit (timetable builder)                     |
| File Upload   | react-dropzone + tus (resumable uploads)        |
| i18n          | next-intl (multi-language support)              |
| Maps          | Mapbox GL (transport tracking)                  |

---

## 9. Real-World Edge Cases & Loopholes

### Academic & Operational

| Scenario                                    | How Schoolmate Handles It                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Mid-year admission**                      | Student admitted to existing class; fee pro-rated from admission month; attendance starts from join date, not session start |
| **Mid-year transfer between branches**      | Transfer workflow: generate TC from source, admit at destination, carry forward fee payments, link history                  |
| **Student promoted but fee unpaid**         | Configurable: block promotion until fees cleared OR allow with flag                                                         |
| **Teacher teaches multiple branches**       | Staff can be linked to multiple branches; timetable shows combined view                                                     |
| **Same student name in same class**         | System uses admission_number as unique ID; UI shows admission# alongside name                                               |
| **Sibling in different branches**           | Parent linked to students across branches; consolidated fee view                                                            |
| **Class teacher changed mid-year**          | Effective dating on section-teacher assignment; history preserved                                                           |
| **Board exam vs internal exam**             | Separate exam types; board exam marks can be imported; both reflected in cumulative report                                  |
| **Different grading for different classes** | Grading system assignable per class level (primary = grades, secondary = percentage)                                        |
| **Student detained in same class**          | Promotion system supports "detained" status; student stays in same class, new academic session                              |
| **Re-admission of withdrawn student**       | Previous records accessible; re-admission creates new enrollment linked to old student record                               |
| **Part-time / visiting faculty**            | Employment type flags; payroll handles hourly/per-lecture pay                                                               |
| **Multiple academic calendars**             | Different branches can have different session dates, holidays, exam schedules                                               |
| **RTE quota students**                      | Category-based fee waiver; separate reporting for RTE compliance                                                            |
| **Special needs students**                  | Medical info, accommodation notes, custom assessment criteria                                                               |

### Fee & Financial

| Scenario                                  | How Schoolmate Handles It                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| **Partial fee payment**                   | Track partial payments; remaining balance carried forward                      |
| **Fee paid in advance**                   | Advance payment allocated to future installments                               |
| **Cheque bounced**                        | Reverse payment, mark cheque as bounced, re-add to outstanding, charge penalty |
| **Fee refund (student leaves mid-term)**  | Pro-rata refund calculation; configurable refund policy per fee head           |
| **Sibling discount auto-calculation**     | Detect siblings, auto-apply discount to younger child (configurable)           |
| **Different fee for old vs new students** | Multiple fee structures per class; assign based on admission year              |
| **Government fee cap**                    | Validate fee structure against configured max limits                           |
| **Donation/optional fee**                 | Separate optional fee heads, not included in defaulter calculations            |
| **GST/Tax on fees**                       | Configurable tax heads; tax included/excluded toggle                           |
| **Currency handling**                     | Tenant config stores currency; all amounts in minor units (paise/cents)        |
| **Payment gateway failures**              | Webhook reconciliation; pending status until confirmed; auto-retry             |
| **Double payment detection**              | Idempotency keys; receipt number uniqueness; duplicate detection algorithm     |

### Attendance

| Scenario                           | How Schoolmate Handles It                                            |
| ---------------------------------- | -------------------------------------------------------------------- |
| **Holiday declared suddenly**      | Bulk mark all as holiday for the day; override individual attendance |
| **Half-day school**                | Period-wise attendance; only morning periods count                   |
| **Student comes late**             | "Late" status with time recorded; configurable late threshold        |
| **Student leaves early (medical)** | "Half-day" with reason; parent notified                              |
| **Biometric device offline**       | Manual attendance fallback; sync when device reconnects              |
| **Teacher forgets to mark**        | Daily reminder notification; admin can see unmarked classes          |
| **Backdated attendance entry**     | Allowed with admin permission; audit logged                          |
| **Attendance for school events**   | Separate "event attendance"; doesn't affect class attendance         |

### Security & Access

| Scenario                                      | How Schoolmate Handles It                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Staff leaves mid-session**                  | Account deactivated (not deleted); data preserved; permissions revoked                |
| **Parent tries to access other child's data** | RLS + application-level checks; parent only sees linked children                      |
| **Tenant admin tries to access other tenant** | JWT contains tenant_id; RLS prevents cross-tenant access                              |
| **Student marks own attendance**              | Role-based: students cannot call mark-attendance API; biometric/QR validates identity |
| **Data export by unauthorized user**          | Export permission separately controlled; audit logged                                 |
| **Impersonation abuse**                       | Super admin impersonation creates separate audit trail; time-limited session          |
| **Brute force login**                         | Rate limiting + account lockout after N failures + CAPTCHA                            |
| **Session hijacking**                         | Token binding to IP/device; concurrent session limit                                  |

### Technical

| Scenario                              | How Schoolmate Handles It                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| **Database migration across tenants** | RLS ensures migration safety; blue-green deployment                            |
| **Tenant data isolation breach**      | PostgreSQL RLS as defense-in-depth; application-level checks; regular audit    |
| **Large tenant impacts others**       | Resource quotas per tenant; query timeout limits; connection pooling           |
| **Offline school (poor internet)**    | PWA with offline attendance marking; sync when online                          |
| **Bulk SMS delivery failure**         | Queue-based with retry; fallback to email; delivery status tracking            |
| **Report generation timeout**         | Background job; notify when ready; cached for re-download                      |
| **File storage limits**               | Per-tenant storage quotas based on plan; compressed thumbnails                 |
| **Academic session rollover**         | Wizard-based: carry forward classes, sections, subjects; bulk promote students |
| **Data retention compliance**         | Configurable retention policies; PII anonymization for alumni after N years    |

---

## 10. Deployment & DevOps

### Docker Compose (Development & Early Production)

```yaml
services:
  api:
    build: ./apps/api
    ports: ['4000:4000']
    depends_on: [postgres, redis]
    environment:
      DATABASE_URL: postgres://...
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ...
      S3_ENDPOINT: ...

  web:
    build: ./apps/web
    ports: ['3000:3000']
    depends_on: [api]

  worker:
    build: ./apps/worker
    depends_on: [postgres, redis]

  postgres:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    volumes: [redisdata:/data]

  meilisearch:
    image: getmeili/meilisearch:latest
    volumes: [msdata:/meili_data]

  minio:
    image: minio/minio
    volumes: [miniodata:/data]
    command: server /data --console-address ":9001"

  nginx:
    image: nginx:alpine
    ports: ['80:80', '443:443']
    volumes: [./nginx/conf.d:/etc/nginx/conf.d]
```

### Environment Strategy

| Environment    | Purpose             | Database                        | Deployment                       |
| -------------- | ------------------- | ------------------------------- | -------------------------------- |
| **Local**      | Developer machine   | Docker Compose                  | `docker compose up`              |
| **Dev**        | Integration testing | Shared Postgres                 | Auto-deploy on PR merge to `dev` |
| **Staging**    | Pre-production      | Clone of production             | Manual deploy; smoke tests       |
| **Production** | Live                | Managed Postgres (RDS/Supabase) | Manual approve after staging     |

### CI/CD Pipeline (GitHub Actions)

```
PR Created → Lint + Type Check + Unit Tests
          → Build Docker images
          → Run integration tests (test containers)
          → Security scan (Snyk/Trivy)

PR Merged to main → Build + Push images
                   → Deploy to staging
                   → Run E2E tests
                   → Manual approval → Deploy to production
                   → Run smoke tests
                   → Notify on success/failure
```

### Monitoring & Alerting

```
Application → Sentry (errors) + Pino logs → ELK (search/analyze)
Infrastructure → Prometheus (metrics) → Grafana (dashboards)
Uptime → Uptime Robot / Betterstack
Alerts → PagerDuty/Slack for P1 issues
Database → pganalyze for slow queries, connections
```

---

## 11. Phased Roadmap

### Phase 0: Foundation (Weeks 1-3)

```
□ Project scaffolding (Turborepo monorepo)
□ Docker Compose setup (Postgres, Redis, MinIO)
□ Database schema design + Drizzle ORM setup
□ Core migrations (tenants, users, branches, sessions)
□ Fastify server with plugin architecture
□ Authentication (login, JWT, refresh, MFA)
□ Multi-tenancy middleware (tenant resolution, RLS)
□ RBAC permission system
□ Next.js setup with shadcn/ui, Tailwind
□ Shared packages (types, validators)
□ CI/CD pipeline (lint, test, build)
□ API documentation setup (Swagger/OpenAPI)
```

### Phase 1: Core Academic (Weeks 4-8)

```
□ Tenant onboarding wizard
□ Branch management
□ Academic session management
□ Class & section management
□ Subject management & teacher assignment
□ Student CRUD + bulk import
□ Student admission workflow
□ Parent management & linking
□ Staff/employee management
□ Student attendance (daily + period-wise)
□ Staff attendance
□ Dashboard (admin, teacher)
```

### Phase 2: Fee & Examination (Weeks 9-13)

```
□ Fee structure configuration
□ Fee allocation & installment plans
□ Fee collection (manual)
□ Payment gateway integration (Razorpay/Stripe)
□ Receipt generation (PDF)
□ Late fee calculation
□ Discounts & concessions
□ Fee reports & defaulter list
□ Exam type configuration
□ Exam scheduling
□ Marks entry & verification
□ Grade calculation
□ Report card generation
□ Result publishing
□ Academic reports
```

### Phase 3: Operations (Weeks 14-18)

```
□ Timetable management (manual + auto-generation)
□ Substitution management
□ Leave management (staff)
□ Payroll processing
□ Library management (catalog, issue/return)
□ Syllabus & lesson planning
□ Assignment management
□ Communication module (announcements, notices)
□ SMS/Email notification engine
□ Calendar & holiday management
```

### Phase 4: Extended Modules (Weeks 19-23)

```
□ Hostel management
□ Transport management
□ Visitor management
□ Inventory & asset tracking
□ Certificate generation
□ Complaint/ticket management
□ Parent portal
□ Student portal
□ Push notifications
□ Bulk operations (import/export)
```

### Phase 5: Advanced & Polish (Weeks 24-28)

```
□ Custom report builder
□ Advanced analytics dashboard
□ PWA / offline support
□ WhatsApp integration
□ Online learning module
□ Audit trail & compliance reports
□ Custom role builder UI
□ Multi-language support (i18n)
□ Tenant customization framework
□ API rate limiting & throttling
□ Performance optimization
□ Security audit & penetration testing
```

### Phase 6: Scale & Launch (Weeks 29-32)

```
□ Load testing (1000+ concurrent users per tenant)
□ Database optimization (indexes, query tuning)
□ CDN setup for static assets
□ Backup & disaster recovery
□ Documentation (user guide, API docs)
□ Marketing website
□ Onboarding tutorial (in-app)
□ Beta launch with 3-5 pilot schools
□ Feedback collection & iteration
□ Production launch
```

### Phase 7: Depth & Verticals (Post-launch, demand-driven)

```
□ Front office & enquiry CRM (module 24) — sell during admission season
□ Question bank + online exams / CBT (module 29)
□ Mobile app (React Native/Expo) — parent + teacher modes first
□ Health & infirmary, discipline & counseling (modules 25-26)
□ Canteen & student wallet (module 27)
□ Coaching center suite: batches, test series, demo classes (module 30)
□ Alumni management (module 28)
□ Higher-ed suite: semesters, credits, GPA (module 31)
□ Webhooks + public API + developer docs
□ AI layer: remarks assistant, at-risk alerts, timetable solver
```

**Sequencing rule**: nothing in Phase 7 starts until the K-12 core (Phases 0-6) has paying tenants. Verticals are pulled forward only by signed customer demand, not speculation.

---

## 12. Monetization & Licensing

### Pricing Tiers

| Plan             | Target                 | Students   | Branches  | Storage   | Features                      | Price (approx) |
| ---------------- | ---------------------- | ---------- | --------- | --------- | ----------------------------- | -------------- |
| **Starter**      | Small coaching centers | Up to 200  | 1         | 5 GB      | Core modules                  | $29/mo         |
| **Growth**       | Single-branch schools  | Up to 1000 | 1         | 25 GB     | All standard modules          | $79/mo         |
| **Professional** | Multi-branch schools   | Up to 5000 | 5         | 100 GB    | All modules + API access      | $199/mo        |
| **Enterprise**   | Large institutions     | Unlimited  | Unlimited | Unlimited | Everything + custom dev + SLA | Custom         |

### Revenue Streams

1. **Monthly SaaS subscription** — primary revenue
2. **SMS/WhatsApp credits** — pass-through with markup
3. **Payment gateway commission** — tiny % on online fee collection
4. **Customization services** — per-tenant custom development
5. **Data migration services** — help schools migrate from legacy systems
6. **Training & onboarding** — paid onboarding sessions
7. **White-label licensing** — for resellers

### Customization Framework

For tenant-specific customizations:

- **Feature flags** — toggle modules on/off per tenant
- **Config-driven** — most variations handled by tenant config JSONB
- **Custom fields** — dynamic form builder for additional fields on any entity
- **Custom reports** — report builder covers most needs
- **Custom workflows** — webhook-based integrations
- **Tenant plugins** — isolated code deployments for major customizations (rare)

---

## 13. Data Security Architecture

### Data Classification & Encryption Strategy

```
┌──────────────────────────────────────────────────────┐
│              DATA SENSITIVITY LEVELS                  │
├──────────────┬───────────────────────────────────────┤
│ CRITICAL     │ Aadhaar/SSN, bank details, passwords, │
│ (Field-level │ payment card data, medical records,    │
│  encryption) │ parent income, biometric data          │
│              │ → AES-256-GCM, per-tenant keys in     │
│              │   HashiCorp Vault / AWS KMS            │
├──────────────┼───────────────────────────────────────┤
│ HIGH         │ Student PII (DOB, address, phone),     │
│ (Encrypted   │ parent contact info, staff salary,     │
│  at rest)    │ exam results (before publishing)       │
│              │ → PostgreSQL TDE + disk encryption     │
├──────────────┼───────────────────────────────────────┤
│ MEDIUM       │ Attendance records, fee payments,      │
│ (Standard    │ timetable, class assignments           │
│  protection) │ → Standard DB security + RLS           │
├──────────────┼───────────────────────────────────────┤
│ LOW          │ Subjects list, holiday calendar,       │
│ (Basic)      │ syllabus structure, announcements      │
│              │ → RLS tenant isolation only             │
└──────────────┴───────────────────────────────────────┘
```

### Security Layers (Defense-in-Depth)

```
Layer 1: Network
  → WAF (Cloudflare) — DDoS, bot protection, geo-blocking
  → TLS 1.3 everywhere, HSTS enabled
  → VPC isolation for database, no public DB access

Layer 2: API Gateway
  → Rate limiting: 100 req/min per user, 1000/min per tenant
  → IP allowlisting option for Enterprise tenants
  → Request size limits, payload validation

Layer 3: Authentication
  → JWT (access 15min + refresh 7 days, rotated on use)
  → MFA support (TOTP / SMS OTP)
  → Brute force: lock after 5 failed attempts for 30min
  → CAPTCHA after 3 failed attempts
  → Concurrent session limit (configurable, default: 3)
  → Session binding to IP + device fingerprint

Layer 4: Authorization (RBAC + ABAC)
  → Every API endpoint checks role + permission
  → Attribute checks: teacher only edits own class marks
  → Parent only sees linked children
  → Branch admin scoped to own branch

Layer 5: Database
  → PostgreSQL RLS policies (tenant_id = current_setting)
  → Application-level tenant_id checks (double defense)
  → Field-level encryption for CRITICAL data (pgcrypto)
  → Encrypted at rest (AES-256)
  → Encrypted backups

Layer 6: Audit
  → Every write operation → audit_logs table
  → Login history with IP, device, status
  → Data export/download actions tracked separately
  → Suspicious activity alerts (bulk export, off-hours access)
  → Admin can review full audit trail
```

### Per-Tenant Encryption Keys

```typescript
// Each tenant gets their own encryption key
// Stored in HashiCorp Vault or AWS KMS — never in the application DB

// Encrypting sensitive field before storing:
const encryptedAadhaar = encrypt(aadhaarNumber, tenantEncryptionKey);
// Stored as: "aes-256-gcm:iv:ciphertext:authTag"

// Even a database admin cannot read CRITICAL fields
// without the application-level tenant key
```

### Compliance Framework

```
India:
  → DPDP Act 2023 (Digital Personal Data Protection)
    - Parental consent required for children's data
    - Right to erasure (anonymize, don't hard delete)
    - Data localization (store in Indian data centers)
    - Data Processing Agreement with each tenant

Global (if expanding):
  → GDPR (EU schools) — consent, portability, erasure
  → COPPA (US schools — children under 13)
  → FERPA (US student education records)

Implementation:
  - Consent management module in onboarding
  - Data export API (right to portability)
  - Anonymization workflow for alumni after configurable N years
  - Cookie consent on parent/student portals
  - Privacy policy auto-generated per tenant jurisdiction
```

---

## 14. Report Cards & Reporting Engine

### Why NOT Crystal Reports

Crystal Reports is a legacy desktop tool requiring SAP licensing. Modern SaaS uses:

| Crystal Reports                  | Schoolmate Approach                           |
| -------------------------------- | --------------------------------------------- |
| SAP license ($$$)                | Open source, zero cost                        |
| Desktop-based, hard to integrate | Cloud-native, API-driven                      |
| Static templates                 | Dynamic React components, tenant-customizable |
| No web preview                   | Live preview before generating PDF            |
| Vendor lock-in                   | Full control, swap any component              |
| Single output format             | PDF, Excel, CSV, on-screen                    |

### Report Card Generation Pipeline

```
┌─────────────────────────────────────────────────────┐
│              REPORT CARD PIPELINE                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Step 1: DATA ASSEMBLY (API)                         │
│  ├── Student info (name, photo, class, roll, DOB)    │
│  ├── All exam results for the session/term           │
│  ├── Attendance summary (days present/total)         │
│  ├── Co-curricular grades                            │
│  ├── Teacher & principal remarks                     │
│  ├── Ranks (class, section, overall)                 │
│  └── Grading scale (from tenant config)              │
│                                                      │
│  Step 2: TEMPLATE ENGINE (React)                     │
│  ├── JSX templates → HTML rendering                  │
│  ├── Tenant-customizable layouts via config:         │
│  │   ├── CBSE format                                 │
│  │   ├── ICSE format                                 │
│  │   ├── State board format                          │
│  │   ├── University / college format                 │
│  │   └── Custom (tenant designs their own)           │
│  ├── Dynamic fields from tenant config               │
│  └── Live preview in browser before PDF generation   │
│                                                      │
│  Step 3: PDF RENDERING (Puppeteer)                   │
│  ├── HTML → pixel-perfect PDF                        │
│  ├── Bulk generation via Bull worker queue            │
│  │   (500 report cards = background job, ~5 min)     │
│  ├── Generated PDFs cached in S3                     │
│  └── Notification sent when batch is ready           │
│                                                      │
│  Step 4: DELIVERY                                    │
│  ├── Download from parent/student portal             │
│  ├── Email PDF to parents                            │
│  ├── Print batch (combined PDF, all students)        │
│  └── WhatsApp share (link with auth token)           │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Report Card Template Configuration (per tenant)

```jsonc
{
  "template_id": "cbse_standard",
  "layout": {
    "header": {
      "show_school_logo": true,
      "show_school_name": true,
      "show_affiliation_number": true,
      "show_address": true,
      "title": "REPORT CARD",
      "session_format": "2025-2026",
    },
    "student_info_fields": [
      "name",
      "class",
      "section",
      "roll_number",
      "admission_no",
      "dob",
      "father_name",
      "mother_name",
    ],
    "academic_table": {
      "columns": ["Subject", "Unit Test 1", "Mid Term", "Unit Test 2", "Final", "Total", "Grade"],
      "show_max_marks": true,
      "show_class_average": false,
      "show_highest_in_class": true,
    },
    "co_curricular": {
      "categories": ["Sports", "Art", "Music", "Dance", "Debate"],
      "grading": "A-E",
    },
    "attendance_summary": {
      "show_total_days": true,
      "show_present_days": true,
      "show_percentage": true,
    },
    "remarks": {
      "class_teacher": true,
      "principal": true,
      "show_next_term_date": true,
    },
    "footer": {
      "signatures": ["Class Teacher", "Principal", "Parent"],
      "show_grading_scale": true,
    },
  },
  "styling": {
    "font": "Times New Roman",
    "primary_color": "#1a365d",
    "border_style": "double",
    "paper_size": "A4",
  },
}
```

### General Reporting Engine (All Reports)

```
┌───────────────────────────────────────────────────┐
│              REPORTING ENGINE                      │
├───────────────────────────────────────────────────┤
│                                                    │
│  TECH STACK:                                       │
│  ├── TanStack Table — on-screen data tables        │
│  ├── Recharts — charts, graphs, heatmaps           │
│  ├── Puppeteer — PDF generation (pixel-perfect)    │
│  ├── ExcelJS — Excel/XLSX export                   │
│  ├── csv-stringify — CSV export                    │
│  ├── Bull queue — background generation for large  │
│  └── Redis — cache frequently-run reports          │
│                                                    │
│  PRE-BUILT REPORTS (30+ standard reports):         │
│  ├── Fee: collection daily/monthly, defaulter      │
│  │   list, head-wise breakup, outstanding          │
│  ├── Attendance: register, absentee, percentage    │
│  ├── Academic: pass %, subject analysis, toppers   │
│  ├── Staff: attendance, leave balance, payroll     │
│  ├── Library: overdue, most issued, stock audit    │
│  ├── Transport: route-wise student list            │
│  ├── Hostel: occupancy, vacancy, mess              │
│  └── Government: UDISE, RTE compliance (India)     │
│                                                    │
│  CUSTOM REPORT BUILDER (drag-and-drop):            │
│  ├── Select data source (students, fees, etc.)     │
│  ├── Pick fields to include (drag-drop columns)    │
│  ├── Add filters (AND/OR conditions)               │
│  ├── Set grouping & sub-totals                     │
│  ├── Insert charts (bar, pie, line)                │
│  ├── Save as reusable template                     │
│  ├── Schedule auto-email (weekly/monthly)          │
│  └── Export: PDF, Excel, CSV                       │
│                                                    │
│  PERFORMANCE:                                      │
│  ├── Small reports (<1000 rows): instant render    │
│  ├── Medium (1K-10K): 2-5 seconds, streamed       │
│  ├── Large (10K+): queued background job,          │
│  │   user notified when ready for download         │
│  └── Cached reports: Redis TTL based on type       │
│                                                    │
│  CERTIFICATE GENERATION (same engine):             │
│  ├── Bonafide, Character, Transfer certificates    │
│  ├── Achievement, Participation, Sports            │
│  ├── Staff Experience certificates                 │
│  ├── ID cards with QR/barcode                      │
│  ├── Customizable templates per tenant             │
│  ├── Bulk generation for entire class              │
│  └── QR code for digital verification              │
│                                                    │
└───────────────────────────────────────────────────┘
```

---

## 15. Institute-Type Support Matrix

The single biggest design decision for supporting "every type of institute" is: **one platform, per-tenant institute profiles** — not separate products. At onboarding, the tenant picks an institute type, which applies a **preset**: which modules are enabled, default terminology, default grading, and default workflows. Everything a preset does is plain tenant config — nothing is hard-coded to a type, so a "school" can still enable batches, and a coaching center can enable hostels.

### Presets

| Capability         | Playschool / Daycare                 | Kindergarten                | Primary/Secondary School  | Full K-12 Multi-Branch          | Coaching Center                        | Small College                   |
| ------------------ | ------------------------------------ | --------------------------- | ------------------------- | ------------------------------- | -------------------------------------- | ------------------------------- |
| Academic unit      | Activity groups                      | Classes (Nursery/LKG/UKG)   | Classes + sections        | Classes + sections per branch   | Courses + batches                      | Programs + semesters            |
| Attendance         | Daily + pickup log                   | Daily                       | Daily or period-wise      | Period-wise                     | Per-batch session                      | Per-lecture with 75% rule       |
| Grading            | Milestone observations               | Descriptive (A/B/C smileys) | Marks + grades            | Board-aligned (CBSE/ICSE/State) | Test-series percentile                 | Credits + SGPA/CGPA             |
| Fees               | Monthly + daycare hours              | Monthly/quarterly           | Installments + heads      | Multi-branch structures         | Course fee + EMI plans                 | Semester fee + backlog fees     |
| Report card        | Milestone portfolio + photos         | Descriptive report          | Term report card          | Cumulative + board format       | Test performance report                | Transcript / grade card         |
| Key extra modules  | Daycare logs, pickup auth, CCTV link | Daycare-lite, transport     | Library, transport, exams | + Hostel, HR/payroll, inventory | Enquiry CRM, demo classes, test series | Elective registration, backlogs |
| Parent involvement | Very high (daily updates)            | High                        | Medium                    | Medium                          | Low (adult students common)            | Minimal                         |
| Terminology pack   | "Group", "Caregiver"                 | "Class", "Teacher"          | "Class", "Teacher"        | "Class/Wing", "Teacher"         | "Batch", "Faculty"                     | "Semester", "Professor"         |

### Implementation

```jsonc
// tenant.config.institute_profile
{
  "type": "coaching_center",
  "enabled_modules": [
    "enquiry_crm",
    "batches",
    "test_series",
    "fees",
    "attendance",
    "online_exams",
    "communication",
  ],
  "terminology": { "class": "Batch", "teacher": "Faculty", "student": "Student" },
  "grading_default": "percentile",
  "attendance_mode": "per_session",
  "student_is_adult": true, // student gets full portal rights, parent optional
}
```

- **Terminology packs** — all UI labels resolve through the terminology map (i18n layer), so a coaching center sees "Batches" everywhere a school sees "Classes".
- **Adult students** — coaching/college students may have no parent account; the parent link is optional and the student receives fee notices directly.
- **Hybrid institutes** — a tenant can run multiple profiles per branch (e.g., a school that also runs evening coaching): branch-level `institute_profile` override.
- **Presets are starting points** — every switch remains editable in tenant settings after onboarding.

---

## 16. SaaS Billing & Tenant Lifecycle Engine

The plan for charging schools (our revenue) needs the same rigor as the fee module (their revenue).

### Tenant Lifecycle State Machine

```
lead → trial (14–30 days, full features, watermarked exports)
     → active (subscribed)
     → past_due (payment failed — grace period, banners shown)
     → suspended (read-only access: they can SEE data, not modify — never hold data hostage abruptly)
     → churned (data export offered, then scheduled deletion)
     → reactivated (from past_due/suspended/churned within retention window)
```

### Billing Engine

| Concern              | Design                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Pricing model        | Base plan + per-student-band overage (e.g., Growth covers 1,000 students; ₹X per additional 100)             |
| Billing metrics      | Nightly job snapshots per-tenant usage: active students, branches, storage, SMS sent                         |
| Proration            | Mid-cycle upgrades prorated immediately; downgrades apply next cycle                                         |
| Invoicing            | GST-compliant invoices (HSN/SAC code, tenant GSTIN), auto-emailed, downloadable                              |
| Dunning              | Payment fail → retry day 1, 3, 7 → email/WhatsApp each retry → past_due banner in-app → suspend day 15       |
| Annual billing       | 2 months free equivalent discount; common for schools budgeting yearly                                       |
| Seasonal reality     | Schools buy in admission season (Feb–June in India); offer "pay when session starts" holds                   |
| SMS/WhatsApp credits | Prepaid credit wallet per tenant, auto-alert at low balance, hard stop at zero (transactional OTPs exempted) |
| Plan enforcement     | Soft limits: warn at 90%, block additions (not access) at 110% — never lock existing data                    |

### Offboarding (Churn) — Do This Well

1. Exit survey (why leaving — feeds product roadmap).
2. Full data export: ZIP of CSVs per module + all documents/PDFs, delivered via secure link.
3. 90-day cold retention (reactivation possible), then irreversible deletion with certificate of deletion (DPDP requirement).
4. Custom domain unmapped; subdomain reserved 12 months to prevent squatting.

---

## 17. Event-Driven Architecture, Webhooks & Public API

### Domain Events (Internal Backbone)

Every significant state change emits a domain event through a **transactional outbox** (event row written in the same DB transaction as the change — no lost or phantom events):

```
student.admitted, student.promoted, student.transferred
fee.payment.received, fee.payment.overdue, fee.cheque.bounced
attendance.marked, attendance.absent_streak
exam.results.published, exam.marks.entered
staff.leave.approved, payroll.processed
hostel.checkout, transport.route.changed
```

```
Write path:  API handler → DB transaction (entity change + outbox row)
Dispatch:    Outbox poller → Redis Streams → consumers
Consumers:   notification engine, report cache invalidator, webhook dispatcher,
             analytics aggregator, audit enricher
```

This is why the notification module stays sane: SMS/email/push logic subscribes to events instead of being sprinkled through business code.

### Webhooks (Tenant-Facing)

- Tenants (Professional+) register webhook endpoints per event type.
- Signed payloads (HMAC-SHA256, per-tenant secret), retries with exponential backoff (5 attempts), dead-letter visibility in tenant settings UI.
- Use cases: sync to school's own accounting, trigger their custom SMS provider, feed their website.

### Public API & Integration Platform

| Layer             | Detail                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Public REST API   | Same versioned API we use internally (`/v1`), tenant-scoped API keys with permission scopes |
| API keys          | Created in settings, scoped (read-only, module-scoped), rotatable, last-used tracking       |
| Rate limits       | Per key, plan-based (Professional: 10K req/day; Enterprise: negotiated)                     |
| OpenAPI spec      | Auto-generated from Fastify schemas; public developer docs portal                           |
| Import API        | Bulk endpoints (students, marks, payments) for migration tools and partner integrations     |
| Partner ecosystem | Biometric vendors, GPS vendors, ed-content providers integrate once, all tenants benefit    |

---

## 18. Mobile App Strategy

Parents and teachers live on mobile; a web-only product loses deals in demos. But we don't build 4 native apps on day one.

### Phased Approach

| Phase   | Deliverable                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Launch  | Fully responsive web + **PWA** (installable, push via web-push, offline attendance marking)               |
| Phase 2 | **React Native (Expo)** single app with role-based UX: parent, student, teacher modes in one binary       |
| Phase 3 | White-label builds for Enterprise (tenant's own icon/name on stores) via Expo EAS + config-driven theming |

### App Scope (deliberately narrower than web)

- **Parent mode**: dashboard, attendance, fees + pay, results, homework, bus tracking, messages, notices, leave request, daycare feed (photos).
- **Teacher mode**: mark attendance (offline-capable, sync later), homework posting, marks entry, timetable, substitutions, messages, leave apply.
- **Student mode**: timetable, homework submission, results, library, online exams (with proctoring constraints), notices.
- Admin work stays on web — complex tables and configuration don't belong in an app.

### Mobile-Specific Engineering

- **Offline-first attendance**: local SQLite queue → sync with conflict rule "last teacher write wins, admin overrides all"; critical for schools with poor connectivity.
- **Push**: FCM + APNs via unified notification engine; deep links (tap fee reminder → payment screen).
- **Bandwidth budget**: list APIs support sparse fieldsets; images served resized via CDN; app functions on 2G/3G.
- **Biometric app-lock** for teacher mode (marks entry protection on shared devices).

---

## 19. Data Migration & Onboarding Playbook

Every school we win already has data — in Excel, in a legacy desktop app (Tally + custom VB apps are common), or in a competitor. **Migration is the #1 sales objection; treat it as a product feature.**

### Migration Toolkit

| Component            | Description                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Import templates     | Opinionated Excel templates per entity (students, parents, staff, fee history, marks) with in-sheet validation         |
| Smart mapper UI      | Upload any spreadsheet → column-mapping wizard with auto-detection ("Father Name" → parent.first_name)                 |
| Validation pass      | Dry-run report: duplicates (same name+DOB), missing mandatory fields, orphan references — fix in-browser before commit |
| Staged import        | Import into staging area, tenant admin reviews sample records, then one-click commit or discard                        |
| Historical data      | Prior-year marks and fee ledgers imported as read-only historical records (no reprocessing)                            |
| Competitor migrators | Purpose-built extractors for common legacy systems as we encounter them (each one becomes a sales weapon)              |
| Rollback             | Every import batch is tagged; a batch can be reversed within 30 days                                                   |

### Onboarding Journey (Time-to-Value < 1 week)

```
Day 0: Signup → guided wizard: institute profile preset, branches, academic session,
       classes/sections auto-scaffolded from preset
Day 1: Student + staff import (toolkit above); parent accounts auto-provisioned
       (invite via SMS/WhatsApp with magic link — parents never do password setup)
Day 2: Fee structures + timetable; sample data purge button
Day 3-5: Staff training (in-app interactive tours per role + Hindi/English video library)
Day 7: Go-live checklist auto-verified: ≥90% students imported, fee structure set,
       ≥1 announcement sent, attendance marked 2 consecutive days
```

- **Onboarding health score** per tenant visible to our success team — tenants stuck below threshold get proactive outreach (churn prevention starts at onboarding).
- **Parallel-run support**: schools run old + new systems for one month; daily digest email builds admin trust in the numbers.

---

## 20. Scalability & Performance Engineering

### Database Strategy at Scale

| Technique           | Application                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table partitioning  | `student_attendance`, `audit_logs`, `notification_queue`, `transport_tracking`, `wallet_transactions` partitioned by month (pg_partman); attendance alone is ~200 rows/student/year × students × tenants |
| Hot/cold archival   | Closed academic sessions moved to archive partitions on cheap storage; report engine reads both transparently                                                                                            |
| Indexing discipline | Composite indexes always lead with `tenant_id`; partial indexes for hot statuses (`WHERE status='pending'`); quarterly index-usage audit                                                                 |
| Connection pooling  | PgBouncer (transaction mode); RLS tenant GUC set per transaction, not per session                                                                                                                        |
| Read replicas       | Reports and analytics route to replicas via read/write splitting in the DB layer                                                                                                                         |
| N+1 defense         | Dataloader pattern in API; p95 query budget enforced in CI perf tests                                                                                                                                    |

### Caching Strategy (Redis)

| Data                                | TTL / Invalidation                          |
| ----------------------------------- | ------------------------------------------- |
| Tenant config, domain→tenant map    | 1h TTL + event-driven bust on config change |
| Permission sets per role            | Bust on role edit                           |
| Timetables                          | Bust on timetable/substitution change       |
| Dashboards/report aggregates        | 5–15 min TTL (staleness acceptable)         |
| Sessions, rate-limit counters, OTPs | Native Redis TTL                            |

### Known Load Spikes (design for these, not averages)

- **Result publication day**: 10–50× read traffic in minutes → pre-generate report-card PDFs _before_ publishing; result API served from cache warmed at publish time.
- **Fee due dates (1st–10th)**: payment gateway callbacks spike → webhook processing is queue-backed and horizontally scalable.
- **Morning attendance window (8–10 AM)**: write burst → attendance writes are simple inserts, no heavy triggers; notifications async via events.
- **Admission season**: enquiry + public form traffic → public endpoints separately rate-limited and cacheable.

### Capacity Milestones

| Milestone         | Architecture posture                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| 0–50 tenants      | Single VM Docker Compose, managed Postgres, daily backups — don't over-build            |
| 50–300 tenants    | Split API/worker/web onto separate nodes, PgBouncer, read replica, CDN                  |
| 300–1,000 tenants | Kubernetes, horizontal API autoscaling, partitioning live, dedicated DBs for Enterprise |
| 1,000+            | Regional cells (group of tenants per cell = blast-radius isolation), cross-region DR    |

---

## 21. Observability, SLOs & Incident Management

### SLOs (what we alert on — user-journey based, not CPU graphs)

| Journey                              | SLO                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Login success rate                   | 99.9%                                                                        |
| Attendance mark API p95              | < 300ms                                                                      |
| Fee payment webhook → receipt issued | < 60s for 99%                                                                |
| OTP delivery                         | < 30s for 95%                                                                |
| Report card batch (500 students)     | < 10 min                                                                     |
| Uptime (school hours 7am–7pm local)  | 99.95% — nights matter less; **maintenance windows only on school holidays** |

### Stack

```
Traces:   OpenTelemetry (Fastify + Next.js instrumentation) → Tempo/Jaeger
Metrics:  Prometheus + Grafana; per-tenant labels for noisy-tenant detection
Logs:     Pino structured JSON → Loki/ELK; every log line carries tenant_id + request_id
Errors:   Sentry (API + web + mobile), release-tagged
Synthetic: login + attendance-mark + fee-pay probes every minute per region
Status:    Public status page (status.schoolmate.app) with per-component health
```

### Incident Management

- Severity ladder: P1 (platform down / data breach) → P4 (cosmetic). P1 pages on-call; P1 during exam-result windows is treated as revenue-critical.
- Tenant comms: in-app banner + status page within 15 min of confirmed P1/P2.
- Blameless postmortems for P1/P2 with tracked action items.
- **School-calendar-aware change freeze**: no risky deploys during board-exam weeks and result seasons (calendar aggregated from tenant data).

---

## 22. Testing & Quality Strategy

| Layer             | Tooling                                    | Coverage focus                                                                                                                                     |
| ----------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Vitest                                     | Fee calculation, late-fee rules, grade/GPA computation, proration — money and marks math gets near-100% coverage                                   |
| Integration       | Vitest + Testcontainers (Postgres, Redis)  | Every API endpoint; **RLS cross-tenant leak tests are mandatory per table** (automated: create 2 tenants, assert zero bleed)                       |
| E2E               | Playwright                                 | Golden paths per role: admit student, mark attendance, collect fee, publish result, parent pays online                                             |
| Permission matrix | Generated tests                            | Auto-generated from permissions catalog: every endpoint × every role → expected allow/deny; fails CI if an endpoint lacks a permission declaration |
| Load              | k6                                         | Result-day and attendance-window scenarios (see §20 spikes) run before each major release                                                          |
| Migration safety  | CI job                                     | Every Drizzle migration runs against a production-shaped dataset snapshot; destructive migrations require explicit override                        |
| Seed data         | Faker-based factory                        | One command spins up a demo tenant per institute type (school/coaching/college) — powers dev, demos, and E2E                                       |
| Security          | Trivy/Snyk in CI + annual external pentest | OWASP Top 10; auth flows fuzzed                                                                                                                    |

**Definition of Done for any module**: unit + integration tests, RLS leak test, permission matrix entries, audit-log coverage, i18n keys extracted, mobile responsiveness verified.

---

## 23. AI & Automation Layer

Positioned as a differentiator tier (Professional+), built on the event/analytics foundation — none of this blocks core launch.

| Feature                       | How                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| At-risk student early warning | Weekly job scores students on attendance decline + grade trend + fee stress signals → counselor dashboard (explainable rules first, ML later)                        |
| Timetable auto-generation     | Constraint solver (teacher availability, room capacity, subject spread, lab blocks) — genuinely hard, high perceived value                                           |
| Admin copilot                 | "How many students in Class 8 have >3 absences this month?" → LLM over a **read-only, tenant-scoped, permission-filtered** query layer; never raw SQL from the model |
| Report card remarks assistant | Draft teacher remarks from marks + attendance + behavior points; teacher edits and approves — teachers' most-hated task                                              |
| Fee collection intelligence   | Predict likely defaulters from payment history; suggest reminder timing per parent (some respond to morning WhatsApp, some to evening SMS)                           |
| Question paper generator      | Blueprint (marks × difficulty × chapters) → auto-select from question bank                                                                                           |
| Enquiry auto-responder        | WhatsApp bot answers admission FAQs (fees, timings, documents) from tenant config; hands off to counselor                                                            |
| Document OCR                  | Photo of TC/birth certificate → extracted fields pre-fill admission forms                                                                                            |

**Guardrails**: per-tenant AI opt-in (contractual), no student PII leaves region, model calls logged in audit trail, AI-generated content always human-approved before reaching parents.

---

## 24. Go-To-Market & Growth

### Beachhead Strategy

Don't launch "for everyone" — presets make the product universal, but sales must be focused:

1. **Beachhead**: English-medium private K-12 schools, 200–1,500 students, tier-2/3 Indian cities — underserved by enterprise ERPs, dissatisfied with legacy desktop software, decision-maker is the owner/principal (short sales cycle).
2. **Second**: coaching centers (huge volume, simpler product surface, faster onboarding, monthly billing appetite).
3. **Later**: multi-branch chains and small colleges (longer cycles, higher ACV, need the Enterprise tier matured).

### Motion

| Channel            | Play                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Direct field sales | Demo-at-school with seeded demo tenant matching their institute type; admission-season campaigns |
| Referrals          | Schools talk to each other in associations — referral discount both sides                        |
| Channel partners   | Local IT vendors/resellers who already serve schools; white-label tier feeds this                |
| Content/SEO        | "UDISE report generator", "fee receipt format" — utility content that ranks                      |
| Free tools         | Free TC generator / fee-receipt tool as lead magnets                                             |

### Retention Levers

- Onboarding health score + success-team outreach (§19).
- Parent adoption is the moat: once 80% of parents use the app for fees and updates, switching cost for the school is enormous — so parent UX quality is a _retention_ investment, not a nicety.
- Annual prepay during admission season locks the school year.

---

## 25. Risk Register

| #   | Risk                                               | Likelihood | Impact                              | Mitigation                                                                                                                      |
| --- | -------------------------------------------------- | ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cross-tenant data leak                             | Low        | Fatal (trust destroyed)             | RLS + app-layer double check, automated leak tests per table (§22), pentest, bug bounty later                                   |
| 2   | Scope explosion → nothing ships                    | **High**   | High                                | Phase discipline (§11); verticals (coaching/college suites) gated behind K-12 core being live with paying tenants               |
| 3   | Fee/money calculation bugs                         | Medium     | High (schools lose trust instantly) | Money math in one audited package, minor units only, near-100% unit coverage, immutable payment ledger + reconciliation reports |
| 4   | Result-day outage                                  | Medium     | High (most visible failure mode)    | Pre-generation + cache warming (§20), load tests simulate it, change freeze in result season (§21)                              |
| 5   | SMS/WhatsApp provider failure or price shock       | Medium     | Medium                              | Multi-provider abstraction with failover; credits model passes cost through                                                     |
| 6   | Legacy-data migration stalls deals                 | High       | Medium                              | Migration toolkit as product (§19), migration service as paid offering                                                          |
| 7   | Low staff digital literacy → poor adoption → churn | High       | High                                | Role-based simplicity, vernacular UI + training videos, offline-tolerant flows, parallel-run month                              |
| 8   | Compliance change (DPDP rules, board formats)      | Medium     | Medium                              | Config-driven report formats; compliance items tracked as roadmap lane, not fire-drills                                         |
| 9   | Key-person dependency (small team)                 | Medium     | Medium                              | This document + ADRs + runbooks in repo; boring, well-known tech choices                                                        |
| 10  | Competitor undercuts on price                      | High       | Medium                              | Compete on parent-app quality + migration ease + support, not price; coaching vertical diversifies                              |
| 11  | Payment gateway disputes/chargebacks               | Low        | Medium                              | Settlement reconciliation job, clear refund policy engine, gateway webhooks idempotent                                          |
| 12  | Seasonal cash flow (schools buy Feb–June)          | High       | Medium                              | Annual prepay incentives, coaching centers (year-round buying) smooth revenue                                                   |

---

## Appendix A: Key Non-Functional Requirements

| Requirement                 | Target                                          |
| --------------------------- | ----------------------------------------------- |
| API response time (p95)     | < 200ms                                         |
| Page load time (LCP)        | < 2.5s                                          |
| Uptime SLA                  | 99.9%                                           |
| RTO (Recovery Time)         | < 1 hour                                        |
| RPO (Recovery Point)        | < 5 minutes                                     |
| Concurrent users per tenant | 500+                                            |
| Data retention              | 7 years (configurable)                          |
| GDPR/data privacy           | Compliant                                       |
| Accessibility               | WCAG 2.1 AA                                     |
| Browser support             | Chrome, Firefox, Safari, Edge (last 2 versions) |
| Mobile responsive           | All pages                                       |

## Appendix B: Third-Party Integrations

| Integration                                 | Purpose                                                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| Razorpay / Stripe                           | Payment gateway                                            |
| Twilio / MSG91                              | SMS                                                        |
| AWS SES / SendGrid                          | Email                                                      |
| Firebase                                    | Push notifications                                         |
| Zoom / Google Meet                          | Online classes                                             |
| Google Calendar                             | Calendar sync                                              |
| Tally / QuickBooks                          | Accounting export                                          |
| Biometric devices                           | Attendance (ZKTeco API, etc.)                              |
| RFID readers                                | Smart card attendance                                      |
| GPS devices                                 | Transport tracking                                         |
| WhatsApp Business API                       | Messaging                                                  |
| Google/Microsoft OAuth                      | SSO login                                                  |
| DigiLocker (India)                          | Verified document fetch (marksheets, certificates)         |
| UDISE+ / state education portals            | Government compliance report formats                       |
| OMR scanning (Scantron-style / open-source) | Offline MCQ evaluation                                     |
| CCTV/NVR streams (Enterprise)               | Live classroom view for playschool parents (consent-gated) |
| Expo EAS                                    | White-label mobile app builds                              |

## Appendix C: Security Checklist

- [ ] All PII encrypted at rest (AES-256)
- [ ] Sensitive fields (Aadhaar, bank details) additionally encrypted at application level
- [ ] HTTPS everywhere (TLS 1.3)
- [ ] SQL injection prevention (parameterized queries via ORM)
- [ ] XSS prevention (React default escaping + CSP headers)
- [ ] CSRF protection (SameSite cookies + CSRF tokens)
- [ ] Rate limiting on all endpoints
- [ ] Brute force protection on login
- [ ] JWT token rotation
- [ ] Row Level Security on database
- [ ] Input validation (Zod schemas, both client and server)
- [ ] File upload validation (type, size, malware scan)
- [ ] Audit logging for all sensitive operations
- [ ] Regular dependency vulnerability scans
- [ ] Penetration testing before launch
- [ ] Data backup encryption
- [ ] RBAC permission checks on every API endpoint
- [ ] No sensitive data in logs
- [ ] Secure headers (Helmet.js equivalent)
- [ ] API versioning for backward compatibility

---

_This plan is designed to be executed iteratively. Each phase produces a deployable product. Start with Phase 0-1 to get a functional MVP, then layer on modules based on market demand and customer feedback._
