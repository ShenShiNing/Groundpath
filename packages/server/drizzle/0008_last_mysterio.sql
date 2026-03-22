ALTER TABLE `system_logs` ADD `metadata_user_id` varchar(36) GENERATED ALWAYS AS (json_unquote(json_extract(metadata, '$.userId'))) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_knowledge_base_id` varchar(36) GENERATED ALWAYS AS (json_unquote(json_extract(metadata, '$.knowledgeBaseId'))) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_stop_reason` varchar(64) GENERATED ALWAYS AS (json_unquote(json_extract(metadata, '$.stopReason'))) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_used_fallback` boolean GENERATED ALWAYS AS (coalesce(json_unquote(json_extract(metadata, '$.usedFallback')) = 'true', false)) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_success` boolean GENERATED ALWAYS AS (coalesce(json_unquote(json_extract(metadata, '$.success')) = 'true', false)) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_structured_requested` boolean GENERATED ALWAYS AS (coalesce(json_unquote(json_extract(metadata, '$.structuredRequested')) = 'true', false)) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_structured_parsed` boolean GENERATED ALWAYS AS (coalesce(json_unquote(json_extract(metadata, '$.structuredParsed')) = 'true', false)) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_final_citation_count` int GENERATED ALWAYS AS (cast(json_unquote(json_extract(metadata, '$.finalCitationCount')) as unsigned)) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_retrieved_citation_count` int GENERATED ALWAYS AS (cast(json_unquote(json_extract(metadata, '$.retrievedCitationCount')) as unsigned)) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_index_freshness_lag_ms` int GENERATED ALWAYS AS (cast(json_unquote(json_extract(metadata, '$.indexFreshnessLagMs')) as unsigned)) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_node_count` int GENERATED ALWAYS AS (cast(json_unquote(json_extract(metadata, '$.nodeCount')) as unsigned)) STORED;--> statement-breakpoint
ALTER TABLE `system_logs` ADD `metadata_edge_count` int GENERATED ALWAYS AS (cast(json_unquote(json_extract(metadata, '$.edgeCount')) as unsigned)) STORED;--> statement-breakpoint
CREATE INDEX `event_created_at_idx` ON `system_logs` (`event`,`created_at`);--> statement-breakpoint
CREATE INDEX `event_user_created_at_idx` ON `system_logs` (`event`,`metadata_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `event_kb_created_at_idx` ON `system_logs` (`event`,`metadata_knowledge_base_id`,`created_at`);