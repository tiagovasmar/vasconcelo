CREATE TABLE `fx_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`rate_10k` integer,
	`mode` text,
	`detail` text,
	`user_email` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fx_log_created_idx` ON `fx_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `fx_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'auto' NOT NULL,
	`auto_rate_10k` integer,
	`auto_provider_updated_at` integer,
	`auto_fetched_at` integer,
	`last_attempt_at` integer,
	`last_error` text,
	`last_error_at` integer,
	`manual_rate_10k` integer,
	`manual_set_at` integer,
	`manual_set_by_email` text,
	`manual_note` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`has_alpha` integer NOT NULL,
	`original_name` text,
	`uploaded_by_email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_assets_sha_idx` ON `media_assets` (`sha256`);--> statement-breakpoint
CREATE TABLE `product_galleries` (
	`product_id` text PRIMARY KEY NOT NULL,
	`items_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by_email` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `inquiries` ADD `fx_rate_10k` integer;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `fx_mode` text;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `fx_source` text;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `fx_as_of` integer;--> statement-breakpoint
ALTER TABLE `inquiry_lines` ADD `unit_price_usd_minor` integer;--> statement-breakpoint
ALTER TABLE `product_overrides` ADD `price_usd_minor` integer;--> statement-breakpoint
ALTER TABLE `product_overrides` ADD `title` text;--> statement-breakpoint
ALTER TABLE `product_overrides` ADD `description` text;--> statement-breakpoint
ALTER TABLE `product_overrides` ADD `order_only` integer DEFAULT false NOT NULL;