CREATE TABLE "wholesale_order_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text NOT NULL,
	"category" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"ars_minor" bigint NOT NULL,
	"exchange_rate_minor" bigint,
	"paid_at" bigint NOT NULL,
	"note" text,
	"created_at" bigint NOT NULL,
	"created_by_email" text NOT NULL,
	"voided_at" bigint,
	"void_reason" text,
	"voided_by_email" text,
	CONSTRAINT "wholesale_order_costs_positive" CHECK ("wholesale_order_costs"."amount_minor" > 0 and "wholesale_order_costs"."ars_minor" > 0),
	CONSTRAINT "wholesale_order_costs_currency" CHECK (("wholesale_order_costs"."currency" = 'ARS' and "wholesale_order_costs"."exchange_rate_minor" is null) or ("wholesale_order_costs"."currency" = 'USD' and "wholesale_order_costs"."exchange_rate_minor" is not null and "wholesale_order_costs"."exchange_rate_minor" > 0))
);
--> statement-breakpoint
ALTER TABLE "order_tracks" ADD COLUMN "customer_carrier" text;--> statement-breakpoint
ALTER TABLE "order_tracks" ADD COLUMN "customer_tracking_number" text;--> statement-breakpoint
ALTER TABLE "wholesale_order_costs" ADD CONSTRAINT "wholesale_order_costs_inquiry_id_order_tracks_inquiry_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."order_tracks"("inquiry_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wholesale_order_costs_order_idx" ON "wholesale_order_costs" USING btree ("inquiry_id","paid_at");