ALTER TABLE `requests` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE `requests` SET `status` = 'allocated'
	WHERE `id` IN (SELECT DISTINCT `request_id` FROM `allocations` WHERE `returned_at` IS NULL AND `request_id` IS NOT NULL);--> statement-breakpoint
UPDATE `requests` SET `status` = 'completed'
	WHERE `id` IN (SELECT DISTINCT `request_id` FROM `allocations` WHERE `request_id` IS NOT NULL)
	AND `id` NOT IN (SELECT DISTINCT `request_id` FROM `allocations` WHERE `returned_at` IS NULL AND `request_id` IS NOT NULL);
