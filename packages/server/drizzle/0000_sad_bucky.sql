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
CREATE TABLE `oauth_exchange_codes` (
	`code_hash` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`return_url` varchar(1000) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `oauth_exchange_codes_code_hash` PRIMARY KEY(`code_hash`)
);
--> statement-breakpoint
CREATE TABLE `user_token_states` (
	`user_id` varchar(36) NOT NULL,
	`token_valid_after` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_token_states_user_id` PRIMARY KEY(`user_id`)
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
	`device_type` varchar(50),
	`browser` varchar(50),
	`browser_version` varchar(20),
	`os` varchar(50),
	`os_version` varchar(20),
	`country` varchar(2),
	`country_name` varchar(100),
	`region` varchar(100),
	`city` varchar(100),
	`timezone` varchar(50),
	`isp` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operation_logs` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`resource_type` enum('document','knowledge_base','user','session') NOT NULL,
	`resource_id` varchar(36),
	`resource_name` varchar(255),
	`action` enum('document.upload','document.update','document.delete','document.restore','document.permanent_delete','document.download','document.upload_version','document.restore_version','knowledge_base.create','knowledge_base.update','knowledge_base.delete','user.change_password','session.logout','session.logout_all','session.revoke') NOT NULL,
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
CREATE TABLE `knowledge_bases` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`embedding_provider` varchar(20) NOT NULL,
	`embedding_model` varchar(100) NOT NULL,
	`embedding_dimensions` int NOT NULL,
	`document_count` int NOT NULL DEFAULT 0,
	`total_chunks` int NOT NULL DEFAULT 0,
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_by` varchar(36),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_by` varchar(36),
	`deleted_at` timestamp,
	CONSTRAINT `knowledge_bases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`knowledge_base_id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`current_version` int NOT NULL DEFAULT 1,
	`file_name` varchar(255) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`file_size` bigint NOT NULL,
	`file_extension` varchar(20) NOT NULL,
	`document_type` enum('pdf','markdown','text','docx','other') NOT NULL DEFAULT 'other',
	`processing_status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`processing_error` text,
	`chunk_count` int NOT NULL DEFAULT 0,
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_by` varchar(36),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_by` varchar(36),
	`deleted_at` timestamp,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`file_size` bigint NOT NULL,
	`file_extension` varchar(20) NOT NULL,
	`document_type` enum('pdf','markdown','text','docx','other') NOT NULL DEFAULT 'other',
	`storage_key` varchar(500) NOT NULL,
	`text_content` longtext,
	`word_count` int,
	`source` enum('upload','edit','ai_generate','restore') NOT NULL DEFAULT 'upload',
	`change_note` varchar(255),
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_version_idx` UNIQUE(`document_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`chunk_index` int NOT NULL,
	`content` text NOT NULL,
	`token_count` int,
	`metadata` json,
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_chunks_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_chunk_idx` UNIQUE(`document_id`,`version`,`chunk_index`)
);
--> statement-breakpoint
CREATE TABLE `llm_configs` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`provider` enum('openai','anthropic','zhipu','deepseek','ollama','custom') NOT NULL,
	`model` varchar(100) NOT NULL,
	`api_key_encrypted` text,
	`base_url` varchar(500),
	`temperature` decimal(3,2) NOT NULL DEFAULT '0.70',
	`max_tokens` int NOT NULL DEFAULT 2048,
	`top_p` decimal(3,2) NOT NULL DEFAULT '1.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llm_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_id_idx` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`knowledge_base_id` varchar(36),
	`title` varchar(255) NOT NULL,
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_by` varchar(36),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_by` varchar(36),
	`deleted_at` timestamp,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` varchar(36) NOT NULL,
	`conversation_id` varchar(36) NOT NULL,
	`role` enum('user','assistant','system') NOT NULL,
	`content` text NOT NULL,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_token_states` ADD CONSTRAINT `user_token_states_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX `oauth_exchange_user_idx` ON `oauth_exchange_codes` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_exchange_expires_idx` ON `oauth_exchange_codes` (`expires_at`);--> statement-breakpoint
CREATE INDEX `oauth_exchange_consumed_idx` ON `oauth_exchange_codes` (`consumed_at`);--> statement-breakpoint
CREATE INDEX `user_token_states_valid_after_idx` ON `user_token_states` (`token_valid_after`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `login_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `email_idx` ON `login_logs` (`email`);--> statement-breakpoint
CREATE INDEX `success_idx` ON `login_logs` (`success`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `login_logs` (`created_at`);--> statement-breakpoint
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
CREATE INDEX `event_idx` ON `system_logs` (`event`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `knowledge_bases` (`user_id`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `knowledge_bases` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `knowledge_base_id_idx` ON `documents` (`knowledge_base_id`);--> statement-breakpoint
CREATE INDEX `processing_status_idx` ON `documents` (`processing_status`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `documents` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `documents` (`created_at`);--> statement-breakpoint
CREATE INDEX `document_id_idx` ON `document_versions` (`document_id`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `document_versions` (`created_at`);--> statement-breakpoint
CREATE INDEX `document_id_idx` ON `document_chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_version_idx` ON `document_chunks` (`document_id`,`version`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `kb_id_idx` ON `conversations` (`knowledge_base_id`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `conversations` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `user_kb_idx` ON `conversations` (`user_id`,`knowledge_base_id`);--> statement-breakpoint
CREATE INDEX `conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `conversation_created_idx` ON `messages` (`conversation_id`,`created_at`);