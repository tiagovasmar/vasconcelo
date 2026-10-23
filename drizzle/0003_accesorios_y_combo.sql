ALTER TABLE "inquiries" ADD COLUMN "combo_discount_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_lines" ADD COLUMN "base_currency" text;--> statement-breakpoint
ALTER TABLE "inquiry_lines" ADD COLUMN "combo_units" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_lines" ADD COLUMN "combo_discount_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_lines" ADD COLUMN "transfer_discount_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_lines" ADD COLUMN "pack_size" integer;--> statement-breakpoint
ALTER TABLE "product_overrides" ADD COLUMN "price_ars_minor" bigint;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "discount_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "discount_kind" text;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "base_currency" text;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "pack_size" integer;