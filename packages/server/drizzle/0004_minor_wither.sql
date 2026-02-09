CREATE TABLE `pdf_annotations` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`document_version` int NOT NULL DEFAULT 1,
	`user_id` varchar(36) NOT NULL,
	`type` enum('text','area','freetext','image','drawing') NOT NULL DEFAULT 'text',
	`position` json NOT NULL,
	`content` json NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#FFEB3B',
	`style` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pdf_annotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `document_id_idx` ON `pdf_annotations` (`document_id`);--> statement-breakpoint
CREATE INDEX `user_id_idx` ON `pdf_annotations` (`user_id`);--> statement-breakpoint
CREATE INDEX `document_version_idx` ON `pdf_annotations` (`document_id`,`document_version`);