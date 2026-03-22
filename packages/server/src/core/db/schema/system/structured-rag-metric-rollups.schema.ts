import {
  bigint,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';

export const structuredRagMetricEventTypes = [
  'agent_execution',
  'index_build',
  'index_graph',
] as const;

export type StructuredRagMetricEventType = (typeof structuredRagMetricEventTypes)[number];

export const structuredRagMetricRollups = mysqlTable(
  'structured_rag_metric_rollups',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    bucketStart: timestamp('bucket_start').notNull(),
    eventType: mysqlEnum('event_type', structuredRagMetricEventTypes).notNull(),
    userId: varchar('user_id', { length: 36 }).notNull().default(''),
    knowledgeBaseId: varchar('knowledge_base_id', { length: 36 }).notNull().default(''),
    totalCount: int('total_count').notNull().default(0),
    fallbackCount: int('fallback_count').notNull().default(0),
    budgetExhaustedCount: int('budget_exhausted_count').notNull().default(0),
    toolTimeoutCount: int('tool_timeout_count').notNull().default(0),
    providerErrorCount: int('provider_error_count').notNull().default(0),
    insufficientEvidenceCount: int('insufficient_evidence_count').notNull().default(0),
    totalDurationMs: bigint('total_duration_ms', { mode: 'number' }).notNull().default(0),
    totalFinalCitationCount: int('total_final_citation_count').notNull().default(0),
    totalRetrievedCitationCount: int('total_retrieved_citation_count').notNull().default(0),
    successCount: int('success_count').notNull().default(0),
    structuredRequestedCount: int('structured_requested_count').notNull().default(0),
    structuredParsedCount: int('structured_parsed_count').notNull().default(0),
    totalFreshnessLagMs: bigint('total_freshness_lag_ms', { mode: 'number' }).notNull().default(0),
    totalNodes: int('total_nodes').notNull().default(0),
    totalEdges: int('total_edges').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('structured_rag_rollup_bucket_idx').on(table.bucketStart),
    index('structured_rag_rollup_event_bucket_idx').on(table.eventType, table.bucketStart),
    index('structured_rag_rollup_user_bucket_idx').on(table.userId, table.bucketStart),
    index('structured_rag_rollup_kb_bucket_idx').on(table.knowledgeBaseId, table.bucketStart),
  ]
);

export type StructuredRagMetricRollup = typeof structuredRagMetricRollups.$inferSelect;
export type NewStructuredRagMetricRollup = typeof structuredRagMetricRollups.$inferInsert;
