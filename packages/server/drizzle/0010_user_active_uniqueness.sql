ALTER TABLE `users` DROP INDEX `username_deleted_idx`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `email_deleted_idx`;--> statement-breakpoint
ALTER TABLE `users` ADD `active_username` varchar(50) GENERATED ALWAYS AS ((case when deleted_at is null then username else null end)) STORED;--> statement-breakpoint
ALTER TABLE `users` ADD `active_email` varchar(255) GENERATED ALWAYS AS ((case when deleted_at is null then email else null end)) STORED;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `active_username_unique_idx` UNIQUE(`active_username`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `active_email_unique_idx` UNIQUE(`active_email`);