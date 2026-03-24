SET @orphan_user_auth_count = (
  SELECT COUNT(*)
  FROM `user_auths` ua
  LEFT JOIN `users` u ON u.`id` = ua.`user_id`
  WHERE u.`id` IS NULL
);--> statement-breakpoint
SET @cleanup_orphan_user_auths_sql = IF(
  @orphan_user_auth_count > 0,
  'DELETE ua FROM `user_auths` ua LEFT JOIN `users` u ON u.`id` = ua.`user_id` WHERE u.`id` IS NULL',
  'SELECT 1'
);--> statement-breakpoint
PREPARE cleanup_orphan_user_auths_stmt FROM @cleanup_orphan_user_auths_sql;--> statement-breakpoint
EXECUTE cleanup_orphan_user_auths_stmt;--> statement-breakpoint
DEALLOCATE PREPARE cleanup_orphan_user_auths_stmt;--> statement-breakpoint
SET @has_user_auths_user_id_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_auths'
    AND CONSTRAINT_NAME = 'user_auths_user_id_fk'
);--> statement-breakpoint
SET @add_user_auths_user_id_fk_sql = IF(
  @has_user_auths_user_id_fk = 0,
  'ALTER TABLE `user_auths` ADD CONSTRAINT `user_auths_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action',
  'SELECT 1'
);--> statement-breakpoint
PREPARE add_user_auths_user_id_fk_stmt FROM @add_user_auths_user_id_fk_sql;--> statement-breakpoint
EXECUTE add_user_auths_user_id_fk_stmt;--> statement-breakpoint
DEALLOCATE PREPARE add_user_auths_user_id_fk_stmt;
