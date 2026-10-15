CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`content_hash` text NOT NULL,
	`session_token_hash` text NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'consulta_preparada' NOT NULL,
	`currency` text NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`delivery_method` text NOT NULL,
	`delivery_json` text NOT NULL,
	`payment_preference` text NOT NULL,
	`contact_name` text,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiries_idempotency_key_unique` ON `inquiries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `inquiries_session_idx` ON `inquiries` (`session_token_hash`);--> statement-breakpoint
CREATE INDEX `inquiries_user_idx` ON `inquiries` (`user_id`);--> statement-breakpoint
CREATE TABLE `inquiry_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inquiry_id` text NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`title` text NOT NULL,
	`language` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`line_subtotal_minor` integer NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inquiry_lines_inquiry_idx` ON `inquiry_lines` (`inquiry_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
