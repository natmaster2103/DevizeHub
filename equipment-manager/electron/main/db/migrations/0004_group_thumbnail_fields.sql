CREATE TABLE `device_groups_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category_id` integer,
	`thumbnail_path` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `device_groups_new` (`id`, `name`, `category_id`, `created_at`)
	SELECT `id`, `name`, `category_id`, `created_at` FROM `device_groups`;--> statement-breakpoint
DROP TABLE `device_groups`;--> statement-breakpoint
ALTER TABLE `device_groups_new` RENAME TO `device_groups`;--> statement-breakpoint
CREATE TABLE `group_field_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `group_field_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`template_id` integer NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `device_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `group_field_templates`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_group_field` ON `group_field_values` (`group_id`,`template_id`);
