CREATE TABLE `folders` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`parent_id` varchar(36),
	`name` varchar(100) NOT NULL,
	`path` varchar(1000) NOT NULL DEFAULT '/',
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_by` varchar(36),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_by` varchar(36),
	`deleted_at` timestamp,
	CONSTRAINT `folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`folder_id` varchar(36),
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
	`text_content` text,
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
CREATE INDEX `user_id_idx` ON `folders` (`user_id`);--> statement-breakpoint
CREATE INDEX `parent_id_idx` ON `folders` (`parent_id`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `folders` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `path_idx` ON `folders` (`path`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE INDEX `folder_id_idx` ON `documents` (`folder_id`);--> statement-breakpoint
CREATE INDEX `processing_status_idx` ON `documents` (`processing_status`);--> statement-breakpoint
CREATE INDEX `deleted_at_idx` ON `documents` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `documents` (`created_at`);--> statement-breakpoint
CREATE INDEX `document_id_idx` ON `document_versions` (`document_id`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `document_versions` (`created_at`);--> statement-breakpoint
CREATE INDEX `document_id_idx` ON `document_chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_version_idx` ON `document_chunks` (`document_id`,`version`);