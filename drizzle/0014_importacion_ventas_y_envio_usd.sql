ALTER TABLE "sales" ADD COLUMN "stock_from_import" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "freight_usd_minor" bigint;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "freight_rate_10k" bigint;