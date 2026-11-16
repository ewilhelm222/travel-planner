CREATE TABLE `planner_images` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`mime` text NOT NULL,
	`data` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `planner_images_trip_id_idx` ON `planner_images` (`trip_id`);