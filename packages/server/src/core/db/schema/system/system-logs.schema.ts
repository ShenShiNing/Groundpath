import {
  mysqlTable,
  varchar,
  timestamp,
  text,
  index,
  mysqlEnum,
  int,
  json,
  boolean,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

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
    metadataUserId: varchar('metadata_user_id', { length: 36 }).generatedAlwaysAs(
      sql`json_unquote(json_extract(metadata, '$.userId'))`,
      { mode: 'stored' }
    ),
    metadataKnowledgeBaseId: varchar('metadata_knowledge_base_id', {
      length: 36,
    }).generatedAlwaysAs(sql`json_unquote(json_extract(metadata, '$.knowledgeBaseId'))`, {
      mode: 'stored',
    }),
    metadataStopReason: varchar('metadata_stop_reason', { length: 64 }).generatedAlwaysAs(
      sql`json_unquote(json_extract(metadata, '$.stopReason'))`,
      { mode: 'stored' }
    ),
    metadataUsedFallback: boolean('metadata_used_fallback').generatedAlwaysAs(
      sql`coalesce(json_unquote(json_extract(metadata, '$.usedFallback')) = 'true', false)`,
      { mode: 'stored' }
    ),
    metadataSuccess: boolean('metadata_success').generatedAlwaysAs(
      sql`coalesce(json_unquote(json_extract(metadata, '$.success')) = 'true', false)`,
      { mode: 'stored' }
    ),
    metadataStructuredRequested: boolean('metadata_structured_requested').generatedAlwaysAs(
      sql`coalesce(json_unquote(json_extract(metadata, '$.structuredRequested')) = 'true', false)`,
      { mode: 'stored' }
    ),
    metadataStructuredParsed: boolean('metadata_structured_parsed').generatedAlwaysAs(
      sql`coalesce(json_unquote(json_extract(metadata, '$.structuredParsed')) = 'true', false)`,
      { mode: 'stored' }
    ),
    metadataFinalCitationCount: int('metadata_final_citation_count').generatedAlwaysAs(
      sql`cast(json_unquote(json_extract(metadata, '$.finalCitationCount')) as unsigned)`,
      { mode: 'stored' }
    ),
    metadataRetrievedCitationCount: int('metadata_retrieved_citation_count').generatedAlwaysAs(
      sql`cast(json_unquote(json_extract(metadata, '$.retrievedCitationCount')) as unsigned)`,
      { mode: 'stored' }
    ),
    metadataIndexFreshnessLagMs: int('metadata_index_freshness_lag_ms').generatedAlwaysAs(
      sql`cast(json_unquote(json_extract(metadata, '$.indexFreshnessLagMs')) as unsigned)`,
      { mode: 'stored' }
    ),
    metadataNodeCount: int('metadata_node_count').generatedAlwaysAs(
      sql`cast(json_unquote(json_extract(metadata, '$.nodeCount')) as unsigned)`,
      { mode: 'stored' }
    ),
    metadataEdgeCount: int('metadata_edge_count').generatedAlwaysAs(
      sql`cast(json_unquote(json_extract(metadata, '$.edgeCount')) as unsigned)`,
      { mode: 'stored' }
    ),

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
    index('event_created_at_idx').on(table.event, table.createdAt),
    index('event_user_created_at_idx').on(table.event, table.metadataUserId, table.createdAt),
    index('event_kb_created_at_idx').on(
      table.event,
      table.metadataKnowledgeBaseId,
      table.createdAt
    ),
  ]
);

export type SystemLog = typeof systemLogs.$inferSelect;
export type NewSystemLog = typeof systemLogs.$inferInsert;
