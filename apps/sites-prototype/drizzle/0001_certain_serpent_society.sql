CREATE TABLE `planner_trips` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`editor_emails` text DEFAULT '[]' NOT NULL,
	`document` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	`share_token_hash` text,
	`shared_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planner_trips_share_token_hash_unique` ON `planner_trips` (`share_token_hash`);