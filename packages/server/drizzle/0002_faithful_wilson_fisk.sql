CREATE TABLE `operation_logs` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`resource_type` enum('document','folder','user','session') NOT NULL,
	`resource_id` varchar(36),
	`resource_name` varchar(255),
	`action` enum('document.upload','document.update','document.delete','document.restore','document.permanent_delete','document.download','document.upload_version','document.restore_version','folder.create','folder.update','folder.delete','user.change_password','session.logout','session.logout_all','session.revoke') NOT NULL,
	`description` varchar(500),
	`old_value` json,
	`new_value` json,
	`metadata` json,
	`ip_address` varchar(45),
	`user_agent` text,
	`status` enum('success','failed') NOT NULL DEFAULT 'success',
	`error_message` varchar(500),
	`duration_ms` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operation_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_logs` (
	`id` varchar(36) NOT NULL,
	`level` enum('debug','info','warn','error','fatal') NOT NULL,
	`category` enum('startup','database','storage','email','oauth','security','performance','scheduler') NOT NULL,
	`event` varchar(100) NOT NULL,
	`message` text NOT NULL,
	`source` varchar(100),
	`trace_id` varchar(36),
	`error_code` varchar(50),
	`error_stack` text,
	`duration_ms` int,
	`metadata` json,
	`hostname` varchar(100),
	`process_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `folders` MODIFY COLUMN `path` varchar(768) NOT NULL DEFAULT '/';--> statement-breakpoint
ALTER TABLE `document_versions` MODIFY COLUMN `text_content` longtext;--> statement-breakpoint
ALTER TABLE `login_logs` ADD `device_type` varchar(50);--> statement-breakpoint
ALTER TABLE `login_logs` ADD `browser` varchar(50);--> statement-breakpoint
ALTER TABLE `login_logs` ADD `browser_version` varchar(20);--> statement-breakpoint
ALTER TABLE `login_logs` ADD `os` varchar(50);--> statement-breakpoint
ALTER TABLE `login_logs` ADD `os_version` varchar(20);--> statement-breakpoint
ALTER TABLE `login_logs` ADD `country` varchar(2);--> statement-breakpoint
ALTER TABLE `login_logs` ADD `country_name` varchar(100);--> statement-breakpoint
ALTER TABLE `login_logs` ADD `region` varchar(100);--> statement-breakpoint
ALTER TABLE `login_logs` ADD `city` varchar(100);--> statement-breakpoint
ALTER TABLE `login_logs` ADD `timezone` varchar(50);--> statement-breakpoint
ALTER TABLE `login_logs` ADD `isp` varchar(100);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `operation_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `resource_type_idx` ON `operation_logs` (`resource_type`);--> statement-breakpoint
CREATE INDEX `action_idx` ON `operation_logs` (`action`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `operation_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `resource_type_action_idx` ON `operation_logs` (`resource_type`,`action`);--> statement-breakpoint
CREATE INDEX `resource_id_idx` ON `operation_logs` (`resource_id`);--> statement-breakpoint
CREATE INDEX `level_idx` ON `system_logs` (`level`);--> statement-breakpoint
CREATE INDEX `category_idx` ON `system_logs` (`category`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `system_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `source_idx` ON `system_logs` (`source`);--> statement-breakpoint
CREATE INDEX `level_category_idx` ON `system_logs` (`level`,`category`);--> statement-breakpoint
CREATE INDEX `event_idx` ON `system_logs` (`event`);