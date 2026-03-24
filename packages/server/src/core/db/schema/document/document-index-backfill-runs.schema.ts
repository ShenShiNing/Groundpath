import {
  boolean,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';
import { users } from '../user/users.schema';
import { knowledgeBases } from './knowledge-bases.schema';

export const documentIndexBackfillRuns = mysqlTable(
  'document_index_backfill_runs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),

    status: mysqlEnum('status', ['running', 'draining', 'completed', 'failed', 'cancelled'])
      .notNull()
      .default('running'),
    trigger: mysqlEnum('trigger', ['manual', 'scheduled']).notNull().default('manual'),

    knowledgeBaseId: varchar('knowledge_base_id', { length: 36 }),
    documentType: mysqlEnum('document_type', ['pdf', 'markdown', 'text', 'docx', 'other']),
    includeIndexed: boolean('include_indexed').notNull().default(false),
    includeProcessing: boolean('include_processing').notNull().default(false),

    batchSize: int('batch_size').notNull(),
    enqueueDelayMs: int('enqueue_delay_ms').notNull(),

    candidateCount: int('candidate_count').notNull().default(0),
    enqueuedCount: int('enqueued_count').notNull().default(0),
    completedCount: int('completed_count').notNull().default(0),
    failedCount: int('failed_count').notNull().default(0),
    skippedCount: int('skipped_count').notNull().default(0),

    cursorOffset: int('cursor_offset').notNull().default(0),
    hasMore: boolean('has_more').notNull().default(true),

    lastError: text('last_error'),

    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),

    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index('document_index_backfill_status_idx').on(table.status),
    index('document_index_backfill_trigger_idx').on(table.trigger),
    index('document_index_backfill_kb_idx').on(table.knowledgeBaseId),
    index('document_index_backfill_created_by_idx').on(table.createdBy),
    index('document_index_backfill_created_at_idx').on(table.createdAt),
    foreignKey({
      columns: [table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.id],
      name: 'document_index_backfill_runs_knowledge_base_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'document_index_backfill_runs_created_by_fk',
    }).onDelete('set null'),
  ]
);

export type DocumentIndexBackfillRun = typeof documentIndexBackfillRuns.$inferSelect;
export type NewDocumentIndexBackfillRun = typeof documentIndexBackfillRuns.$inferInsert;
