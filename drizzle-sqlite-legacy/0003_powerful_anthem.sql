CREATE TABLE `wholesale_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`business_name` text NOT NULL,
	`locality` text NOT NULL,
	`province` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'pendiente' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by_email` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wholesale_requests_user_id_unique` ON `wholesale_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `wholesale_requests_status_idx` ON `wholesale_requests` (`status`);--> statement-breakpoint
ALTER TABLE `inquiries` ADD `discount_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inquiry_lines` ADD `fulfillment` text DEFAULT 'stock' NOT NULL;