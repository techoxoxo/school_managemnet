CREATE TABLE "fee_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"due_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_payment_id_fee_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."fee_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payment_allocations" ADD CONSTRAINT "fee_payment_allocations_due_id_fee_dues_id_fk" FOREIGN KEY ("due_id") REFERENCES "public"."fee_dues"("id") ON DELETE cascade ON UPDATE no action;