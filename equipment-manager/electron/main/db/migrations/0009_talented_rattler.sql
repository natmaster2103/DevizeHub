CREATE TABLE `app_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`auto_logout_enabled` integer DEFAULT 0 NOT NULL,
	`auto_logout_time` text DEFAULT '07:30' NOT NULL
);
