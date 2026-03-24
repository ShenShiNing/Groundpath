import {
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { users } from '../user/users.schema';
import { documents } from './documents.schema';
import { documentIndexBackfillRuns } from './document-index-backfill-runs.schema';
import { knowledgeBases } from './knowledge-bases.schema';

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
    index('document_index_backfill_item_user_idx').on(table.userId),
    index('document_index_backfill_item_kb_idx').on(table.knowledgeBaseId),
    foreignKey({
      columns: [table.runId],
      foreignColumns: [documentIndexBackfillRuns.id],
      name: 'document_index_backfill_items_run_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [documents.id],
      name: 'document_index_backfill_items_document_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'document_index_backfill_items_user_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.id],
      name: 'document_index_backfill_items_knowledge_base_id_fk',
    }).onDelete('cascade'),
  ]
);

export type DocumentIndexBackfillItem = typeof documentIndexBackfillItems.$inferSelect;
export type NewDocumentIndexBackfillItem = typeof documentIndexBackfillItems.$inferInsert;
