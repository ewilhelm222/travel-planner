CREATE TABLE `planner_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`at` text NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`records` text DEFAULT '[]' NOT NULL,
	`undoes` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planner_changes_trip_revision_unique` ON `planner_changes` (`trip_id`,`revision`);--> statement-breakpoint
CREATE INDEX `planner_changes_trip_id_idx` ON `planner_changes` (`trip_id`,`id`);--> statement-breakpoint
ALTER TABLE `planner_trips` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `planner_trips` ADD `archived_by` text;