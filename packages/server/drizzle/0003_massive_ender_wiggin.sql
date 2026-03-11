CREATE TABLE `document_index_backfill_runs` (
	`id` varchar(36) NOT NULL,
	`status` enum('running','draining','completed','failed','cancelled') NOT NULL DEFAULT 'running',
	`trigger` enum('manual','scheduled') NOT NULL DEFAULT 'manual',
	`knowledge_base_id` varchar(36),
	`document_type` enum('pdf','markdown','text','docx','other'),
	`include_indexed` boolean NOT NULL DEFAULT false,
	`include_processing` boolean NOT NULL DEFAULT false,
	`batch_size` int NOT NULL,
	`enqueue_delay_ms` int NOT NULL,
	`candidate_count` int NOT NULL DEFAULT 0,
	`enqueued_count` int NOT NULL DEFAULT 0,
	`completed_count` int NOT NULL DEFAULT 0,
	`failed_count` int NOT NULL DEFAULT 0,
	`skipped_count` int NOT NULL DEFAULT 0,
	`cursor_offset` int NOT NULL DEFAULT 0,
	`has_more` boolean NOT NULL DEFAULT true,
	`last_error` text,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_index_backfill_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_index_backfill_items` (
	`id` varchar(36) NOT NULL,
	`run_id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`knowledge_base_id` varchar(36) NOT NULL,
	`document_version` int NOT NULL,
	`status` enum('pending','enqueued','processing','completed','failed','skipped') NOT NULL DEFAULT 'pending',
	`job_id` varchar(191),
	`error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`enqueued_at` timestamp,
	`completed_at` timestamp,
	CONSTRAINT `document_index_backfill_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_index_backfill_run_document_idx` UNIQUE(`run_id`,`document_id`)
);
--> statement-breakpoint
CREATE INDEX `document_index_backfill_status_idx` ON `document_index_backfill_runs` (`status`);--> statement-breakpoint
CREATE INDEX `document_index_backfill_trigger_idx` ON `document_index_backfill_runs` (`trigger`);--> statement-breakpoint
CREATE INDEX `document_index_backfill_kb_idx` ON `document_index_backfill_runs` (`knowledge_base_id`);--> statement-breakpoint
CREATE INDEX `document_index_backfill_created_at_idx` ON `document_index_backfill_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `document_index_backfill_run_status_idx` ON `document_index_backfill_items` (`run_id`,`status`);--> statement-breakpoint
CREATE INDEX `document_index_backfill_document_idx` ON `document_index_backfill_items` (`document_id`);