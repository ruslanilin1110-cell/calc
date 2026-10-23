CREATE TABLE `collaboration_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_members` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`wallet_id` text NOT NULL,
	`shipment_ids` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`user_id` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_members_email_unique` ON `ledger_members` (`email`);--> statement-breakpoint
CREATE TABLE `payment_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`member_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	`reviewer` text,
	`reason` text,
	`decision_key` text
);
