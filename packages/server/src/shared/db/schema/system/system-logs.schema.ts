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

export const logLevels = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = (typeof logLevels)[number];

export const logCategories = [
  'startup',
  'database',
  'storage',
  'email',
  'oauth',
  'security',
  'performance',
  'scheduler',
] as const;
export type LogCategory = (typeof logCategories)[number];

export const systemLogs = mysqlTable(
  'system_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),

    // Log classification
    level: mysqlEnum('level', logLevels).notNull(),
    category: mysqlEnum('category', logCategories).notNull(),

    // Event info
    event: varchar('event', { length: 100 }).notNull(),
    message: text('message').notNull(),

    // Source tracking
    source: varchar('source', { length: 100 }),
    traceId: varchar('trace_id', { length: 36 }),

    // Error details
    errorCode: varchar('error_code', { length: 50 }),
    errorStack: text('error_stack'),

    // Performance
    durationMs: int('duration_ms'),

    // Additional data
    metadata: json('metadata'),

    // Environment context
    hostname: varchar('hostname', { length: 100 }),
    processId: int('process_id'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('level_idx').on(table.level),
    index('category_idx').on(table.category),
    index('created_at_idx').on(table.createdAt),
    index('source_idx').on(table.source),
    index('level_category_idx').on(table.level, table.category),
    index('event_idx').on(table.event),
  ]
);

export type SystemLog = typeof systemLogs.$inferSelect;
export type NewSystemLog = typeof systemLogs.$inferInsert;
