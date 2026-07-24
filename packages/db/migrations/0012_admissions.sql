CREATE TYPE "public"."admission_status" AS ENUM('applied', 'under_review', 'shortlisted', 'interview', 'offered', 'accepted', 'rejected', 'withdrawn', 'enrolled');--> statement-breakpoint
CREATE TABLE "admissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"application_number" text NOT NULL,
	"applicant_first_name" text NOT NULL,
	"applicant_last_name" text,
	"date_of_birth" date,
	"gender" "gender",
	"class_applied_for" uuid,
	"academic_session_id" uuid,
	"guardian_name" text,
	"guardian_phone" text,
	"guardian_email" text,
	"previous_school_name" text,
	"status" "admission_status" DEFAULT 'applied' NOT NULL,
	"status_reason" text,
	"notes" text,
	"converted_student_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_class_applied_for_classes_id_fk" FOREIGN KEY ("class_applied_for") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_converted_student_id_students_id_fk" FOREIGN KEY ("converted_student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admissions_application_number_unique" ON "admissions" USING btree ("tenant_id","application_number");