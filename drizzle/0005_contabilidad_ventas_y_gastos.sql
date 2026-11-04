CREATE TABLE "accounting_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"spent_at" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"description" text NOT NULL,
	"payment_method" text NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by_email" text NOT NULL,
	CONSTRAINT "accounting_expenses_amount_check" CHECK ("accounting_expenses"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "sold_on" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "received_minor" bigint;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "installments" integer;--> statement-breakpoint
CREATE INDEX "accounting_expenses_date_idx" ON "accounting_expenses" USING btree ("spent_at");