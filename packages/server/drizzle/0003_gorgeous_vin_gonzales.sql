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
ALTER TABLE `operation_logs` MODIFY COLUMN `resource_type` enum('document','folder','knowledge_base','user','session') NOT NULL;--> statement-breakpoint
ALTER TABLE `operation_logs` MODIFY COLUMN `action` enum('document.upload','document.update','document.delete','document.restore','document.permanent_delete','document.download','document.upload_version','document.restore_version','folder.create','folder.update','folder.delete','knowledge_base.create','knowledge_base.update','knowledge_base.delete','user.change_password','session.logout','session.logout_all','session.revoke') NOT NULL;--> statement-breakpoint
ALTER TABLE `folders` ADD `knowledge_base_id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `knowledge_base_id` varchar(36) NOT NULL;--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `knowledge_bases` (`user_id`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `knowledge_bases` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `conversations` (`user_id`);--> statement-breakpoint
CREATE INDEX `kb_id_idx` ON `conversations` (`knowledge_base_id`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `conversations` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `user_kb_idx` ON `conversations` (`user_id`,`knowledge_base_id`);--> statement-breakpoint
CREATE INDEX `conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `conversation_created_idx` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `knowledge_base_id_idx` ON `folders` (`knowledge_base_id`);--> statement-breakpoint
CREATE INDEX `knowledge_base_id_idx` ON `documents` (`knowledge_base_id`);