CREATE TABLE "storefront_visits" (
	"day" text NOT NULL,
	"browser" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "storefront_visits_day_browser" ON "storefront_visits" USING btree ("day","browser");