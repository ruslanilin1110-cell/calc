CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`shipment_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL
);
