CREATE TABLE `product_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text NOT NULL,
	`new_value` text NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_audit_product_idx` ON `product_audit` (`product_id`);--> statement-breakpoint
CREATE INDEX `product_audit_created_idx` ON `product_audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `product_overrides` (
	`product_id` text PRIMARY KEY NOT NULL,
	`price_minor` integer,
	`stock_quantity` integer,
	`max_per_order` integer,
	`visible` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by_email` text NOT NULL
);
