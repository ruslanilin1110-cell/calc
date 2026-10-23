CREATE TABLE `shipment_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`owner` text NOT NULL,
	`shipment_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`actor_role` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipment_messages_id_unique` ON `shipment_messages` (`id`);--> statement-breakpoint
CREATE INDEX `shipment_messages_thread_idx` ON `shipment_messages` (`owner`,`shipment_id`,`seq`);