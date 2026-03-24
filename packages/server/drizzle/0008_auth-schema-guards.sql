ALTER TABLE `users` DROP INDEX `username_deleted_idx`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `email_deleted_idx`;--> statement-breakpoint
ALTER TABLE `users` ADD `active_username` varchar(50) GENERATED ALWAYS AS ((case when deleted_at is null then username else null end)) STORED;--> statement-breakpoint
ALTER TABLE `users` ADD `active_email` varchar(255) GENERATED ALWAYS AS ((case when deleted_at is null then email else null end)) STORED;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_active_username_idx` UNIQUE(`active_username`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_active_email_idx` UNIQUE(`active_email`);--> statement-breakpoint
ALTER TABLE `user_auths` ADD CONSTRAINT `user_auths_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;