CREATE TABLE `structured_rag_metric_rollups` (
	`id` varchar(191) NOT NULL,
	`bucket_start` timestamp NOT NULL,
	`event_type` enum('agent_execution','index_build','index_graph') NOT NULL,
	`user_id` varchar(36) NOT NULL DEFAULT '',
	`knowledge_base_id` varchar(36) NOT NULL DEFAULT '',
	`total_count` int NOT NULL DEFAULT 0,
	`fallback_count` int NOT NULL DEFAULT 0,
	`budget_exhausted_count` int NOT NULL DEFAULT 0,
	`tool_timeout_count` int NOT NULL DEFAULT 0,
	`provider_error_count` int NOT NULL DEFAULT 0,
	`insufficient_evidence_count` int NOT NULL DEFAULT 0,
	`total_duration_ms` bigint NOT NULL DEFAULT 0,
	`total_final_citation_count` int NOT NULL DEFAULT 0,
	`total_retrieved_citation_count` int NOT NULL DEFAULT 0,
	`success_count` int NOT NULL DEFAULT 0,
	`structured_requested_count` int NOT NULL DEFAULT 0,
	`structured_parsed_count` int NOT NULL DEFAULT 0,
	`total_freshness_lag_ms` bigint NOT NULL DEFAULT 0,
	`total_nodes` int NOT NULL DEFAULT 0,
	`total_edges` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `structured_rag_metric_rollups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `structured_rag_rollup_bucket_idx` ON `structured_rag_metric_rollups` (`bucket_start`);--> statement-breakpoint
CREATE INDEX `structured_rag_rollup_event_bucket_idx` ON `structured_rag_metric_rollups` (`event_type`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `structured_rag_rollup_user_bucket_idx` ON `structured_rag_metric_rollups` (`user_id`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `structured_rag_rollup_kb_bucket_idx` ON `structured_rag_metric_rollups` (`knowledge_base_id`,`bucket_start`);