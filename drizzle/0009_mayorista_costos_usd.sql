ALTER TABLE "wholesale_order_costs" DROP CONSTRAINT "wholesale_order_costs_positive";--> statement-breakpoint
ALTER TABLE "wholesale_order_costs" DROP CONSTRAINT "wholesale_order_costs_currency";--> statement-breakpoint
ALTER TABLE "wholesale_order_costs" ALTER COLUMN "ars_minor" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_tracks" ADD COLUMN "agreed_usd_minor" bigint;--> statement-breakpoint
ALTER TABLE "wholesale_order_costs" ADD CONSTRAINT "wholesale_order_costs_positive" CHECK ("wholesale_order_costs"."amount_minor" >= 0 and "wholesale_order_costs"."ars_minor" >= 0);--> statement-breakpoint
ALTER TABLE "wholesale_order_costs" ADD CONSTRAINT "wholesale_order_costs_currency" CHECK (
    ("wholesale_order_costs"."exchange_rate_minor" is null or "wholesale_order_costs"."exchange_rate_minor" > 0)
    and (("wholesale_order_costs"."currency" = 'ARS' and "wholesale_order_costs"."ars_minor" is not null)
      or ("wholesale_order_costs"."currency" = 'USD' and ("wholesale_order_costs"."ars_minor" is null) = ("wholesale_order_costs"."exchange_rate_minor" is null))));