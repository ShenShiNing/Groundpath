SET @has_index_version_id_column = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_chunks'
    AND COLUMN_NAME = 'index_version_id'
);--> statement-breakpoint
SET @add_index_version_id_column_sql = IF(
  @has_index_version_id_column = 0,
  'ALTER TABLE `document_chunks` ADD `index_version_id` varchar(36)',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_index_version_id_column_stmt FROM @add_index_version_id_column_sql;--> statement-breakpoint
EXECUTE add_index_version_id_column_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_index_version_id_column_stmt;--> statement-breakpoint
UPDATE `document_chunks` dc
INNER JOIN `documents` d ON d.`id` = dc.`document_id`
SET dc.`index_version_id` = d.`active_index_version_id`
WHERE dc.`index_version_id` IS NULL
  AND d.`active_index_version_id` IS NOT NULL;--> statement-breakpoint
UPDATE `document_chunks` dc
INNER JOIN (
  SELECT v1.`document_id`, v1.`document_version`, v1.`id`
  FROM `document_index_versions` v1
  INNER JOIN (
    SELECT `document_id`, `document_version`, MAX(`built_at`) AS `max_built_at`
    FROM `document_index_versions`
    GROUP BY `document_id`, `document_version`
  ) latest
    ON latest.`document_id` = v1.`document_id`
   AND latest.`document_version` = v1.`document_version`
   AND latest.`max_built_at` = v1.`built_at`
) latest_build
  ON latest_build.`document_id` = dc.`document_id`
 AND latest_build.`document_version` = dc.`version`
SET dc.`index_version_id` = latest_build.`id`
WHERE dc.`index_version_id` IS NULL;--> statement-breakpoint
UPDATE `document_chunks` dc
INNER JOIN `document_index_versions` active_build
  ON active_build.`document_id` = dc.`document_id`
 AND active_build.`status` = 'active'
SET dc.`index_version_id` = active_build.`id`
WHERE dc.`index_version_id` IS NULL;--> statement-breakpoint
SET @index_version_id_is_nullable = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_chunks'
    AND COLUMN_NAME = 'index_version_id'
    AND IS_NULLABLE = 'YES'
);--> statement-breakpoint
SET @make_index_version_id_not_null_sql = IF(
  @index_version_id_is_nullable = 1,
  'ALTER TABLE `document_chunks` MODIFY COLUMN `index_version_id` varchar(36) NOT NULL',
  'SELECT 1'
);--> statement-breakpoint
PREPARE make_index_version_id_not_null_stmt FROM @make_index_version_id_not_null_sql;--> statement-breakpoint
EXECUTE make_index_version_id_not_null_stmt;--> statement-breakpoint
DEALLOCATE PREPARE make_index_version_id_not_null_stmt;--> statement-breakpoint
SET @has_old_document_chunk_idx = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_chunks'
    AND INDEX_NAME = 'document_chunk_idx'
);--> statement-breakpoint
SET @drop_old_document_chunk_idx_sql = IF(
  @has_old_document_chunk_idx > 0,
  'ALTER TABLE `document_chunks` DROP INDEX `document_chunk_idx`',
  'SELECT 1'
);--> statement-breakpoint
PREPARE drop_old_document_chunk_idx_stmt FROM @drop_old_document_chunk_idx_sql;--> statement-breakpoint
EXECUTE drop_old_document_chunk_idx_stmt;--> statement-breakpoint
DEALLOCATE PREPARE drop_old_document_chunk_idx_stmt;--> statement-breakpoint
SET @has_document_chunk_index_version_idx = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_chunks'
    AND INDEX_NAME = 'document_chunk_index_version_idx'
);--> statement-breakpoint
SET @add_document_chunk_index_version_idx_sql = IF(
  @has_document_chunk_index_version_idx = 0,
  'ALTER TABLE `document_chunks` ADD INDEX `document_chunk_index_version_idx`(`document_id`,`index_version_id`)',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_document_chunk_index_version_idx_stmt FROM @add_document_chunk_index_version_idx_sql;--> statement-breakpoint
EXECUTE add_document_chunk_index_version_idx_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_document_chunk_index_version_idx_stmt;--> statement-breakpoint
SET @has_new_document_chunk_idx = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_chunks'
    AND INDEX_NAME = 'document_chunk_idx'
);--> statement-breakpoint
SET @add_new_document_chunk_idx_sql = IF(
  @has_new_document_chunk_idx = 0,
  'ALTER TABLE `document_chunks` ADD UNIQUE INDEX `document_chunk_idx`(`document_id`,`index_version_id`,`chunk_index`)',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_new_document_chunk_idx_stmt FROM @add_new_document_chunk_idx_sql;--> statement-breakpoint
EXECUTE add_new_document_chunk_idx_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_new_document_chunk_idx_stmt;--> statement-breakpoint
SET @has_document_chunks_index_version_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'document_chunks'
    AND CONSTRAINT_NAME = 'document_chunks_index_version_id_fk'
);--> statement-breakpoint
SET @add_document_chunks_index_version_fk_sql = IF(
  @has_document_chunks_index_version_fk = 0,
  'ALTER TABLE `document_chunks` ADD CONSTRAINT `document_chunks_index_version_id_fk` FOREIGN KEY (`index_version_id`) REFERENCES `document_index_versions`(`id`) ON DELETE cascade ON UPDATE no action',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_document_chunks_index_version_fk_stmt FROM @add_document_chunks_index_version_fk_sql;--> statement-breakpoint
EXECUTE add_document_chunks_index_version_fk_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_document_chunks_index_version_fk_stmt;
