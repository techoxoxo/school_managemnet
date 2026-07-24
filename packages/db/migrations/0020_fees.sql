CREATE TYPE "public"."fee_discount_type" AS ENUM('sibling', 'merit', 'staff_ward', 'scholarship', 'custom');--> statement-breakpoint
CREATE TYPE "public"."fee_due_status" AS ENUM('pending', 'partial', 'paid', 'overdue', 'waived');--> statement-breakpoint
CREATE TYPE "public"."fee_frequency" AS ENUM('one_time', 'monthly', 'quarterly', 'half_yearly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."fee_payment_method" AS ENUM('cash', 'cheque', 'upi', 'card', 'net_banking', 'bank_transfer', 'online');--> statement-breakpoint
CREATE TYPE "public"."fee_payment_status" AS ENUM('completed', 'pending', 'bounced', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TABLE "fee_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"discount_type" "fee_discount_type" DEFAULT 'custom' NOT NULL,
	"value_type" text DEFAULT 'flat' NOT NULL,
	"value" bigint NOT NULL,
	"reason" text,
	"status" text DEFAULT 'approved' NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_dues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"structure_item_id" uuid,
	"head" text NOT NULL,
	"period" text NOT NULL,
	"amount_due" bigint NOT NULL,
	"amount_paid" bigint DEFAULT 0 NOT NULL,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"status" "fee_due_status" DEFAULT 'pending' NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"method" "fee_payment_method" DEFAULT 'cash' NOT NULL,
	"reference" text,
	"receipt_number" text NOT NULL,
	"status" "fee_payment_status" DEFAULT 'completed' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"collected_by" uuid,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_structure_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"structure_id" uuid NOT NULL,
	"head" text NOT NULL,
	"amount" bigint NOT NULL,
	"frequency" "fee_frequency" DEFAULT 'annual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"class_id" uuid,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_dues" ADD CONSTRAINT "fee_dues_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_dues" ADD CONSTRAINT "fee_dues_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_dues" ADD CONSTRAINT "fee_dues_structure_item_id_fee_structure_items_id_fk" FOREIGN KEY ("structure_item_id") REFERENCES "public"."fee_structure_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_collected_by_users_id_fk" FOREIGN KEY ("collected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_structure_id_fee_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_session_id_academic_sessions_id_fk" FOREIGN KEY ("academic_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_payments_receipt_unique" ON "fee_payments" USING btree ("tenant_id","receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structures_unique" ON "fee_structures" USING btree ("tenant_id","academic_session_id","class_id","name");