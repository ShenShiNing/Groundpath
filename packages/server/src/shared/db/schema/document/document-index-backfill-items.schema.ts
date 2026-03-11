import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';

export const documentIndexBackfillItems = mysqlTable(
  'document_index_backfill_items',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    runId: varchar('run_id', { length: 36 }).notNull(),
    documentId: varchar('document_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    knowledgeBaseId: varchar('knowledge_base_id', { length: 36 }).notNull(),
    documentVersion: int('document_version').notNull(),
    status: mysqlEnum('status', [
      'pending',
      'enqueued',
      'processing',
      'completed',
      'failed',
      'skipped',
    ])
      .notNull()
      .default('pending'),
    jobId: varchar('job_id', { length: 191 }),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    enqueuedAt: timestamp('enqueued_at'),
    completedAt: timestamp('completed_at'),
  },
  (table) => [
    uniqueIndex('document_index_backfill_run_document_idx').on(table.runId, table.documentId),
    index('document_index_backfill_run_status_idx').on(table.runId, table.status),
    index('document_index_backfill_document_idx').on(table.documentId),
  ]
);

export type DocumentIndexBackfillItem = typeof documentIndexBackfillItems.$inferSelect;
export type NewDocumentIndexBackfillItem = typeof documentIndexBackfillItems.$inferInsert;
