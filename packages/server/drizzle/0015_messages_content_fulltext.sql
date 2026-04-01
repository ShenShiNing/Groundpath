SET @messages_content_fulltext_exists := (
  SELECT COUNT(DISTINCT index_name)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'messages'
    AND column_name = 'content'
    AND index_type = 'FULLTEXT'
);
--> statement-breakpoint
SET @messages_content_fulltext_sql := IF(
  @messages_content_fulltext_exists = 0,
  'ALTER TABLE `messages` ADD FULLTEXT INDEX `messages_content_fulltext_idx` (`content`)',
  'SELECT 1'
);
--> statement-breakpoint
PREPARE messages_content_fulltext_stmt FROM @messages_content_fulltext_sql;
--> statement-breakpoint
EXECUTE messages_content_fulltext_stmt;
--> statement-breakpoint
DEALLOCATE PREPARE messages_content_fulltext_stmt;
