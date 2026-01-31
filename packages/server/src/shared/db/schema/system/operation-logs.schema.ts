import {
  mysqlTable,
  varchar,
  timestamp,
  text,
  index,
  mysqlEnum,
  int,
  json,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from '../user/users.schema';

export const resourceTypes = ['document', 'folder', 'user', 'session'] as const;
export type ResourceType = (typeof resourceTypes)[number];

export const operationActions = [
  // Document actions
  'document.upload',
  'document.update',
  'document.delete',
  'document.restore',
  'document.permanent_delete',
  'document.download',
  'document.upload_version',
  'document.restore_version',
  // Folder actions
  'folder.create',
  'folder.update',
  'folder.delete',
  // User actions
  'user.change_password',
  // Session actions
  'session.logout',
  'session.logout_all',
  'session.revoke',
] as const;
export type OperationAction = (typeof operationActions)[number];

export const operationStatuses = ['success', 'failed'] as const;
export type OperationStatus = (typeof operationStatuses)[number];

export const operationLogs = mysqlTable(
  'operation_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),

    // Resource info
    resourceType: mysqlEnum('resource_type', resourceTypes).notNull(),
    resourceId: varchar('resource_id', { length: 36 }),
    resourceName: varchar('resource_name', { length: 255 }),

    // Action details
    action: mysqlEnum('action', operationActions).notNull(),
    description: varchar('description', { length: 500 }),

    // Change tracking (JSON for storing old/new values)
    oldValue: json('old_value'),
    newValue: json('new_value'),

    // Additional metadata
    metadata: json('metadata'),

    // Request context
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),

    // Result
    status: mysqlEnum('status', operationStatuses).notNull().default('success'),
    errorMessage: varchar('error_message', { length: 500 }),

    // Performance tracking
    durationMs: int('duration_ms'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_id_idx').on(table.userId),
    index('resource_type_idx').on(table.resourceType),
    index('action_idx').on(table.action),
    index('created_at_idx').on(table.createdAt),
    index('resource_type_action_idx').on(table.resourceType, table.action),
    index('resource_id_idx').on(table.resourceId),
  ]
);

// ==================== Relations ====================
export const operationLogsRelations = relations(operationLogs, ({ one }) => ({
  user: one(users, {
    fields: [operationLogs.userId],
    references: [users.id],
  }),
}));

export type OperationLog = typeof operationLogs.$inferSelect;
export type NewOperationLog = typeof operationLogs.$inferInsert;
