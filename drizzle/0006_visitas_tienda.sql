CREATE TABLE "storefront_visits" (
	"day" text NOT NULL,
	"browser" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_visits_day_browser" ON "storefront_visits" USING btree ("day","browser");
--> statement-breakpoint
-- Keep new server-managed tables private on Supabase.
ALTER TABLE "applied_costs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cost_expense_shares" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cost_expenses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cost_purchase_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cost_purchases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "line_deliveries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_incidents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_refunds" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_tracks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_receipts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "restock_alerts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sale_commissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shipment_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "wholesale_tiers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "accounting_expenses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "storefront_visits" ENABLE ROW LEVEL SECURITY;
