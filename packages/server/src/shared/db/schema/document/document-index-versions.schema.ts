import {
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { documents } from './documents.schema';

export const documentIndexVersions = mysqlTable(
  'document_index_versions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),

    // Reference to the document and document version this index belongs to
    documentId: varchar('document_id', { length: 36 }).notNull(),
    documentVersion: int('document_version').notNull(),
    indexVersion: varchar('index_version', { length: 64 }).notNull(),

    // Routing / lifecycle
    routeMode: mysqlEnum('route_mode', ['structured', 'chunked']).notNull().default('chunked'),
    status: mysqlEnum('status', ['building', 'active', 'failed', 'superseded'])
      .notNull()
      .default('building'),

    // Parse metadata
    parseMethod: varchar('parse_method', { length: 50 }),
    parserRuntime: varchar('parser_runtime', { length: 50 }),
    parseConfidence: decimal('parse_confidence', { precision: 5, scale: 4 }),
    headingCount: int('heading_count').notNull().default(0),
    orphanNodeRatio: decimal('orphan_node_ratio', { precision: 5, scale: 4 }),
    pageCoverage: decimal('page_coverage', { precision: 5, scale: 4 }),
    parseDurationMs: int('parse_duration_ms'),

    // Diagnostics
    workerJobId: varchar('worker_job_id', { length: 191 }),
    error: text('error'),

    // Audit
    createdBy: varchar('created_by', { length: 36 }),
    builtAt: timestamp('built_at').defaultNow().notNull(),
    activatedAt: timestamp('activated_at'),
  },
  (table) => [
    uniqueIndex('document_index_version_idx').on(table.documentId, table.indexVersion),
    index('document_index_document_version_idx').on(table.documentId, table.documentVersion),
    index('document_index_status_idx').on(table.documentId, table.status),
    index('document_index_built_at_idx').on(table.builtAt),
    index('document_index_activated_at_idx').on(table.activatedAt),
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [documents.id],
      name: 'document_index_versions_document_id_fk',
    }).onDelete('cascade'),
  ]
);

export const documentIndexVersionsRelations = relations(documentIndexVersions, ({ one }) => ({
  document: one(documents, {
    fields: [documentIndexVersions.documentId],
    references: [documents.id],
  }),
}));

export type DocumentIndexVersion = typeof documentIndexVersions.$inferSelect;
export type NewDocumentIndexVersion = typeof documentIndexVersions.$inferInsert;
