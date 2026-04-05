DROP INDEX `conversation_created_idx` ON `messages`;--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `created_at` timestamp(3) NOT NULL DEFAULT (now(3));--> statement-breakpoint
UPDATE `messages` AS `messages_to_update`
INNER JOIN (
	SELECT `ranked_messages`.`id`, TIMESTAMPADD(MICROSECOND, (`ranked_messages`.`collision_rank` - 1) * 1000, `ranked_messages`.`created_at`) AS `normalized_created_at`
	FROM (
		SELECT
			`messages`.`id`,
			`messages`.`created_at`,
			ROW_NUMBER() OVER (
				PARTITION BY `messages`.`conversation_id`, `messages`.`created_at`
				ORDER BY `messages`.`id`
			) AS `collision_rank`
		FROM `messages`
	) AS `ranked_messages`
	WHERE `ranked_messages`.`collision_rank` > 1
) AS `normalized_messages`
	ON `normalized_messages`.`id` = `messages_to_update`.`id`
SET `messages_to_update`.`created_at` = `normalized_messages`.`normalized_created_at`;--> statement-breakpoint
CREATE INDEX `conversation_created_idx` ON `messages` (`conversation_id`,`created_at`,`id`);
