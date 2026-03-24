DELETE items
FROM `document_index_backfill_items` items
LEFT JOIN `document_index_backfill_runs` runs ON runs.`id` = items.`run_id`
LEFT JOIN `documents` d ON d.`id` = items.`document_id`
LEFT JOIN `users` u ON u.`id` = items.`user_id`
LEFT JOIN `knowledge_bases` kb ON kb.`id` = items.`knowledge_base_id`
WHERE runs.`id` IS NULL
   OR d.`id` IS NULL
   OR u.`id` IS NULL
   OR kb.`id` IS NULL;--> statement-breakpoint
DELETE runs
FROM `document_index_backfill_runs` runs
LEFT JOIN `knowledge_bases` kb ON kb.`id` = runs.`knowledge_base_id`
WHERE runs.`knowledge_base_id` IS NOT NULL
  AND kb.`id` IS NULL;--> statement-breakpoint
UPDATE `document_index_backfill_runs` runs
LEFT JOIN `users` u ON u.`id` = runs.`created_by`
SET runs.`created_by` = NULL
WHERE runs.`created_by` IS NOT NULL
  AND u.`id` IS NULL;--> statement-breakpoint
SET @has_document_index_backfill_runs_knowledge_base_id_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_index_backfill_runs'
    AND CONSTRAINT_NAME = 'document_index_backfill_runs_knowledge_base_id_fk'
);--> statement-breakpoint
SET @add_document_index_backfill_runs_knowledge_base_id_fk_sql = IF(
  @has_document_index_backfill_runs_knowledge_base_id_fk = 0,
  'ALTER TABLE `document_index_backfill_runs` ADD CONSTRAINT `document_index_backfill_runs_knowledge_base_id_fk` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases`(`id`) ON DELETE cascade ON UPDATE no action',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_document_index_backfill_runs_knowledge_base_id_fk_stmt FROM @add_document_index_backfill_runs_knowledge_base_id_fk_sql;--> statement-breakpoint
EXECUTE add_document_index_backfill_runs_knowledge_base_id_fk_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_document_index_backfill_runs_knowledge_base_id_fk_stmt;--> statement-breakpoint
SET @has_document_index_backfill_runs_created_by_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_index_backfill_runs'
    AND CONSTRAINT_NAME = 'document_index_backfill_runs_created_by_fk'
);--> statement-breakpoint
SET @add_document_index_backfill_runs_created_by_fk_sql = IF(
  @has_document_index_backfill_runs_created_by_fk = 0,
  'ALTER TABLE `document_index_backfill_runs` ADD CONSTRAINT `document_index_backfill_runs_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_document_index_backfill_runs_created_by_fk_stmt FROM @add_document_index_backfill_runs_created_by_fk_sql;--> statement-breakpoint
EXECUTE add_document_index_backfill_runs_created_by_fk_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_document_index_backfill_runs_created_by_fk_stmt;--> statement-breakpoint
SET @has_document_index_backfill_items_run_id_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_index_backfill_items'
    AND CONSTRAINT_NAME = 'document_index_backfill_items_run_id_fk'
);--> statement-breakpoint
SET @add_document_index_backfill_items_run_id_fk_sql = IF(
  @has_document_index_backfill_items_run_id_fk = 0,
  'ALTER TABLE `document_index_backfill_items` ADD CONSTRAINT `document_index_backfill_items_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `document_index_backfill_runs`(`id`) ON DELETE cascade ON UPDATE no action',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_document_index_backfill_items_run_id_fk_stmt FROM @add_document_index_backfill_items_run_id_fk_sql;--> statement-breakpoint
EXECUTE add_document_index_backfill_items_run_id_fk_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_document_index_backfill_items_run_id_fk_stmt;--> statement-breakpoint
SET @has_document_index_backfill_items_document_id_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_index_backfill_items'
    AND CONSTRAINT_NAME = 'document_index_backfill_items_document_id_fk'
);--> statement-breakpoint
SET @add_document_index_backfill_items_document_id_fk_sql = IF(
  @has_document_index_backfill_items_document_id_fk = 0,
  'ALTER TABLE `document_index_backfill_items` ADD CONSTRAINT `document_index_backfill_items_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_document_index_backfill_items_document_id_fk_stmt FROM @add_document_index_backfill_items_document_id_fk_sql;--> statement-breakpoint
EXECUTE add_document_index_backfill_items_document_id_fk_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_document_index_backfill_items_document_id_fk_stmt;--> statement-breakpoint
SET @has_document_index_backfill_items_user_id_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_index_backfill_items'
    AND CONSTRAINT_NAME = 'document_index_backfill_items_user_id_fk'
);--> statement-breakpoint
SET @add_document_index_backfill_items_user_id_fk_sql = IF(
  @has_document_index_backfill_items_user_id_fk = 0,
  'ALTER TABLE `document_index_backfill_items` ADD CONSTRAINT `document_index_backfill_items_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_document_index_backfill_items_user_id_fk_stmt FROM @add_document_index_backfill_items_user_id_fk_sql;--> statement-breakpoint
EXECUTE add_document_index_backfill_items_user_id_fk_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_document_index_backfill_items_user_id_fk_stmt;--> statement-breakpoint
SET @has_document_index_backfill_items_knowledge_base_id_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_index_backfill_items'
    AND CONSTRAINT_NAME = 'document_index_backfill_items_knowledge_base_id_fk'
);--> statement-breakpoint
SET @add_document_index_backfill_items_knowledge_base_id_fk_sql = IF(
  @has_document_index_backfill_items_knowledge_base_id_fk = 0,
  'ALTER TABLE `document_index_backfill_items` ADD CONSTRAINT `document_index_backfill_items_knowledge_base_id_fk` FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases`(`id`) ON DELETE cascade ON UPDATE no action',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_document_index_backfill_items_knowledge_base_id_fk_stmt FROM @add_document_index_backfill_items_knowledge_base_id_fk_sql;--> statement-breakpoint
EXECUTE add_document_index_backfill_items_knowledge_base_id_fk_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_document_index_backfill_items_knowledge_base_id_fk_stmt;--> statement-breakpoint
CREATE INDEX `document_index_backfill_created_by_idx` ON `document_index_backfill_runs` (`created_by`);--> statement-breakpoint
CREATE INDEX `document_index_backfill_item_user_idx` ON `document_index_backfill_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `document_index_backfill_item_kb_idx` ON `document_index_backfill_items` (`knowledge_base_id`);
