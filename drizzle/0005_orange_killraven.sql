CREATE TABLE `procurement_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`member_id` text NOT NULL,
	`author` text NOT NULL,
	`payload` text NOT NULL,
	`change_key` text,
	`status` text DEFAULT 'new' NOT NULL,
	`seen_at` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `procurement_requests_owner_idx` ON `procurement_requests` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `procurement_settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ledger_members` ADD `role` text DEFAULT 'carrier' NOT NULL;