ALTER TABLE "order_payments" ADD COLUMN "currency" text DEFAULT 'ARS' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "amount_usd_minor" bigint;--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "exchange_rate_10k" bigint;