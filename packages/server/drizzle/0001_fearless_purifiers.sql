CREATE TABLE `document_index_versions` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`document_version` int NOT NULL,
	`index_version` varchar(64) NOT NULL,
	`route_mode` enum('structured','chunked') NOT NULL DEFAULT 'chunked',
	`status` enum('building','active','failed','superseded') NOT NULL DEFAULT 'building',
	`parse_method` varchar(50),
	`parser_runtime` varchar(50),
	`parse_confidence` decimal(5,4),
	`heading_count` int NOT NULL DEFAULT 0,
	`orphan_node_ratio` decimal(5,4),
	`page_coverage` decimal(5,4),
	`parse_duration_ms` int,
	`worker_job_id` varchar(191),
	`error` text,
	`created_by` varchar(36),
	`built_at` timestamp NOT NULL DEFAULT (now()),
	`activated_at` timestamp,
	CONSTRAINT `document_index_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_index_version_idx` UNIQUE(`document_id`,`index_version`)
);
--> statement-breakpoint
CREATE TABLE `document_nodes` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`index_version_id` varchar(36) NOT NULL,
	`node_type` enum('document','chapter','section','paragraph','table','figure','appendix') NOT NULL DEFAULT 'section',
	`title` varchar(500),
	`depth` int NOT NULL DEFAULT 0,
	`section_path` json,
	`page_start` int,
	`page_end` int,
	`parent_id` varchar(36),
	`order_no` int NOT NULL,
	`token_count` int,
	`stable_locator` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_nodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_node_order_idx` UNIQUE(`index_version_id`,`order_no`)
);
--> statement-breakpoint
CREATE TABLE `document_node_contents` (
	`node_id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`index_version_id` varchar(36) NOT NULL,
	`content` longtext NOT NULL,
	`content_preview` text,
	`token_count` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_node_contents_node_id` PRIMARY KEY(`node_id`)
);
--> statement-breakpoint
CREATE TABLE `document_edges` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`index_version_id` varchar(36) NOT NULL,
	`from_node_id` varchar(36) NOT NULL,
	`to_node_id` varchar(36) NOT NULL,
	`edge_type` enum('parent','next','refers_to','cites') NOT NULL,
	`anchor_text` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_edges_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_edge_unique_idx` UNIQUE(`index_version_id`,`from_node_id`,`to_node_id`,`edge_type`)
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `active_index_version_id` varchar(36);--> statement-breakpoint
CREATE INDEX `document_index_document_version_idx` ON `document_index_versions` (`document_id`,`document_version`);--> statement-breakpoint
CREATE INDEX `document_index_status_idx` ON `document_index_versions` (`document_id`,`status`);--> statement-breakpoint
CREATE INDEX `document_index_built_at_idx` ON `document_index_versions` (`built_at`);--> statement-breakpoint
CREATE INDEX `document_index_activated_at_idx` ON `document_index_versions` (`activated_at`);--> statement-breakpoint
CREATE INDEX `document_node_document_idx` ON `document_nodes` (`document_id`,`index_version_id`);--> statement-breakpoint
CREATE INDEX `document_node_parent_idx` ON `document_nodes` (`index_version_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `document_node_type_idx` ON `document_nodes` (`index_version_id`,`node_type`);--> statement-breakpoint
CREATE INDEX `document_node_content_version_idx` ON `document_node_contents` (`document_id`,`index_version_id`);--> statement-breakpoint
CREATE INDEX `document_node_content_node_idx` ON `document_node_contents` (`index_version_id`,`node_id`);--> statement-breakpoint
CREATE INDEX `document_edge_from_idx` ON `document_edges` (`index_version_id`,`from_node_id`);--> statement-breakpoint
CREATE INDEX `document_edge_to_idx` ON `document_edges` (`index_version_id`,`to_node_id`);--> statement-breakpoint
CREATE INDEX `document_edge_document_idx` ON `document_edges` (`document_id`,`index_version_id`);--> statement-breakpoint
CREATE INDEX `active_index_version_id_idx` ON `documents` (`active_index_version_id`);