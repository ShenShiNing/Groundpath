ALTER TABLE `document_nodes` ADD `image_storage_key` varchar(500);--> statement-breakpoint
ALTER TABLE `document_nodes` ADD `image_classification` varchar(50);--> statement-breakpoint
ALTER TABLE `document_node_contents` ADD `image_description` text;