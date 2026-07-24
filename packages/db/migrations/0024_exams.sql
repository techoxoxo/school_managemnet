CREATE TYPE "public"."exam_status" AS ENUM('draft', 'scheduled', 'ongoing', 'completed', 'published');--> statement-breakpoint
CREATE TYPE "public"."grading_type" AS ENUM('percentage', 'gpa', 'letter');--> statement-breakpoint
CREATE TYPE "public"."result_status" AS ENUM('entered', 'verified', 'locked');--> statement-breakpoint
CREATE TABLE "exam_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"exam_subject_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"marks_obtained" integer,
	"is_absent" boolean DEFAULT false NOT NULL,
	"is_exempt" boolean DEFAULT false NOT NULL,
	"grade" text,
	"status" "result_status" DEFAULT 'entered' NOT NULL,
	"entered_by" uuid,
	"verified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"exam_date" date,
	"start_time" time,
	"max_marks" integer DEFAULT 100 NOT NULL,
	"pass_marks" integer DEFAULT 33 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weightage" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"exam_type_id" uuid,
	"class_id" uuid,
	"grading_system_id" uuid,
	"name" text NOT NULL,
	"max_marks" integer DEFAULT 100 NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" "exam_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grading_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "grading_type" DEFAULT 'percentage' NOT NULL,
	"scale" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_marks" integer,
	"max_marks" integer,
	"percentage_bp" integer,
	"grade" text,
	"rank" integer,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_exam_subject_id_exam_subjects_id_fk" FOREIGN KEY ("exam_subject_id") REFERENCES "public"."exam_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_types" ADD CONSTRAINT "exam_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_types" ADD CONSTRAINT "exam_types_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_exam_type_id_exam_types_id_fk" FOREIGN KEY ("exam_type_id") REFERENCES "public"."exam_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_grading_system_id_grading_systems_id_fk" FOREIGN KEY ("grading_system_id") REFERENCES "public"."grading_systems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_systems" ADD CONSTRAINT "grading_systems_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_systems" ADD CONSTRAINT "grading_systems_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_results_unique" ON "exam_results" USING btree ("tenant_id","exam_subject_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_subjects_unique" ON "exam_subjects" USING btree ("tenant_id","exam_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_types_branch_name_unique" ON "exam_types" USING btree ("tenant_id","branch_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "report_cards_unique" ON "report_cards" USING btree ("tenant_id","exam_id","student_id");