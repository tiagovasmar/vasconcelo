ALTER TABLE "import_parcels" ADD COLUMN "released_stock" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "available_at" bigint;--> statement-breakpoint
UPDATE "import_parcels" AS p SET "released_stock" = p."accepted"
FROM "import_allocations" AS a
WHERE a."id" = p."allocation_id" AND a."destination" = 'reventa' AND p."accepted" > 0;
