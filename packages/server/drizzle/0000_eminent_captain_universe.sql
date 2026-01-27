CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`username` varchar(50) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password` varchar(255),
	`avatar_url` text,
	`bio` text,
	`status` enum('active','inactive','banned') NOT NULL DEFAULT 'inactive',
	`email_verified` boolean NOT NULL DEFAULT false,
	`email_verified_at` timestamp,
	`last_login_at` timestamp,
	`last_login_ip` varchar(45),
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_by` varchar(36),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_by` varchar(36),
	`deleted_at` timestamp,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `username_deleted_idx` UNIQUE(`username`,`deleted_at`),
	CONSTRAINT `email_deleted_idx` UNIQUE(`email`,`deleted_at`)
);
--> statement-breakpoint
CREATE TABLE `user_auths` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`auth_type` enum('email','github','wechat','google','password') NOT NULL,
	`auth_id` varchar(255) NOT NULL,
	`auth_data` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_auths_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_type_id_idx` UNIQUE(`auth_type`,`auth_id`)
);
--> statement-breakpoint
CREATE TABLE `email_verification_codes` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`code` varchar(6) NOT NULL,
	`type` enum('register','login','reset_password','change_email') NOT NULL,
	`used` boolean NOT NULL DEFAULT false,
	`used_at` timestamp,
	`expires_at` timestamp NOT NULL,
	`ip_address` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_verification_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token` varchar(500) NOT NULL,
	`device_info` json,
	`ip_address` varchar(45),
	`revoked` boolean NOT NULL DEFAULT false,
	`revoked_at` timestamp,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_used_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `token_idx` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `login_logs` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`email` varchar(255),
	`auth_type` enum('email','github','wechat','google','password') NOT NULL,
	`success` boolean NOT NULL,
	`failure_reason` varchar(255),
	`ip_address` varchar(45),
	`user_agent` text,
	`location` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `status_idx` ON `users` (`status`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `users` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `email_verified_idx` ON `users` (`email_verified`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `user_auths` (`user_id`);--> statement-breakpoint
CREATE INDEX `email_idx` ON `email_verification_codes` (`email`);--> statement-breakpoint
CREATE INDEX `code_idx` ON `email_verification_codes` (`code`);--> statement-breakpoint
CREATE INDEX `expires_at_idx` ON `email_verification_codes` (`expires_at`);--> statement-breakpoint
CREATE INDEX `used_idx` ON `email_verification_codes` (`used`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `expires_at_idx` ON `refresh_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `revoked_idx` ON `refresh_tokens` (`revoked`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `login_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `email_idx` ON `login_logs` (`email`);--> statement-breakpoint
CREATE INDEX `success_idx` ON `login_logs` (`success`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `login_logs` (`created_at`);