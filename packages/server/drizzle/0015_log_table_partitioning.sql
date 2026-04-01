SET time_zone = '+00:00';
--> statement-breakpoint
DROP PROCEDURE IF EXISTS ensure_monthly_partitioned_log_table;
--> statement-breakpoint
CREATE PROCEDURE ensure_monthly_partitioned_log_table(IN target_table VARCHAR(64))
partition_proc: BEGIN
  DECLARE existing_partition_count INT DEFAULT 0;
  DECLARE current_month_start DATE;
  DECLARE legacy_boundary DATE;
  DECLARE cursor_month DATE;
  DECLARE stop_month DATE;
  DECLARE partition_sql LONGTEXT;
  DECLARE primary_key_sql LONGTEXT;
  DECLARE alter_sql LONGTEXT;

  SELECT COUNT(*)
    INTO existing_partition_count
  FROM information_schema.partitions
  WHERE table_schema = DATABASE()
    AND table_name = target_table
    AND partition_name IS NOT NULL;

  IF existing_partition_count > 0 THEN
    LEAVE partition_proc;
  END IF;

  SET current_month_start = DATE_FORMAT(UTC_DATE(), '%Y-%m-01');
  SET legacy_boundary = DATE_SUB(current_month_start, INTERVAL 12 MONTH);
  SET cursor_month = legacy_boundary;
  SET stop_month = DATE_ADD(current_month_start, INTERVAL 6 MONTH);

  SET partition_sql = CONCAT(
    'PARTITION p_legacy VALUES LESS THAN (UNIX_TIMESTAMP(''',
    DATE_FORMAT(legacy_boundary, '%Y-%m-%d 00:00:00'),
    '''))'
  );

  WHILE cursor_month <= stop_month DO
    SET partition_sql = CONCAT(
      partition_sql,
      ', PARTITION p',
      DATE_FORMAT(cursor_month, '%Y%m'),
      ' VALUES LESS THAN (UNIX_TIMESTAMP(''',
      DATE_FORMAT(DATE_ADD(cursor_month, INTERVAL 1 MONTH), '%Y-%m-%d 00:00:00'),
      '''))'
    );
    SET cursor_month = DATE_ADD(cursor_month, INTERVAL 1 MONTH);
  END WHILE;

  SET partition_sql = CONCAT(
    partition_sql,
    ', PARTITION pmax VALUES LESS THAN MAXVALUE'
  );

  SET primary_key_sql = CONCAT(
    'ALTER TABLE `',
    target_table,
    '` DROP PRIMARY KEY, ',
    'ADD PRIMARY KEY (`id`, `created_at`)'
  );

  SET @partition_primary_key_sql = primary_key_sql;
  PREPARE primary_key_stmt FROM @partition_primary_key_sql;
  EXECUTE primary_key_stmt;
  DEALLOCATE PREPARE primary_key_stmt;

  SET alter_sql = CONCAT(
    'ALTER TABLE `',
    target_table,
    '` PARTITION BY RANGE (UNIX_TIMESTAMP(`created_at`)) (',
    partition_sql,
    ')'
  );

  SET @partition_alter_sql = alter_sql;
  PREPARE partition_stmt FROM @partition_alter_sql;
  EXECUTE partition_stmt;
  DEALLOCATE PREPARE partition_stmt;
END
--> statement-breakpoint
CALL ensure_monthly_partitioned_log_table('login_logs');
--> statement-breakpoint
CALL ensure_monthly_partitioned_log_table('operation_logs');
--> statement-breakpoint
DROP PROCEDURE IF EXISTS ensure_monthly_partitioned_log_table;
