CREATE INDEX `documents_user_deleted_created_id_idx` ON `documents` (`user_id`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `documents_user_deleted_title_id_idx` ON `documents` (`user_id`,`deleted_at`,`title`,`id`);--> statement-breakpoint
CREATE INDEX `documents_user_deleted_file_size_id_idx` ON `documents` (`user_id`,`deleted_at`,`file_size`,`id`);--> statement-breakpoint
CREATE INDEX `documents_user_deleted_at_id_idx` ON `documents` (`user_id`,`deleted_at`,`id`);--> statement-breakpoint
CREATE INDEX `documents_kb_deleted_created_id_idx` ON `documents` (`knowledge_base_id`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `documents_kb_deleted_title_id_idx` ON `documents` (`knowledge_base_id`,`deleted_at`,`title`,`id`);--> statement-breakpoint
CREATE INDEX `documents_kb_deleted_file_size_id_idx` ON `documents` (`knowledge_base_id`,`deleted_at`,`file_size`,`id`);