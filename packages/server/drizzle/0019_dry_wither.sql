ALTER TABLE `document_index_backfill_runs` ADD `active_scheduled_slot` varchar(32) GENERATED ALWAYS AS ((case when `trigger` = 'scheduled' and `status` in ('running', 'draining') then 'scheduled' else null end)) STORED;--> statement-breakpoint
ALTER TABLE `messages` ADD `sequence` bigint unsigned;--> statement-breakpoint
SET @message_sequence := 0;--> statement-breakpoint
UPDATE `messages`
SET `sequence` = (@message_sequence := @message_sequence + 1)
ORDER BY `created_at` ASC, `id` ASC;--> statement-breakpoint
ALTER TABLE `document_index_backfill_runs` ADD CONSTRAINT `document_index_backfill_active_scheduled_unique_idx` UNIQUE(`active_scheduled_slot`);--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_sequence_unique_idx` UNIQUE(`sequence`);--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `sequence` bigint unsigned AUTO_INCREMENT NOT NULL;--> statement-breakpoint
CREATE INDEX `conversation_sequence_idx` ON `messages` (`conversation_id`,`sequence`);
