import {
  mysqlTable,
  varchar,
  timestamp,
  index,
  uniqueIndex,
  text,
  int,
  json,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { documents } from './documents.schema';
import { documentIndexVersions } from './document-index-versions.schema';

export const documentChunks = mysqlTable(
  'document_chunks',
  {
    id: varchar('id', { length: 36 }).primaryKey(), // UUID

    // Reference
    documentId: varchar('document_id', { length: 36 }).notNull(),
    version: int('version').notNull(),
    indexVersionId: varchar('index_version_id', { length: 36 }).notNull(),

    // Chunk info
    chunkIndex: int('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenCount: int('token_count'),

    // Metadata (for locating original content)
    metadata: json('metadata').$type<{
      pageNumber?: number;
      heading?: string;
      startOffset?: number;
      endOffset?: number;
    }>(),

    // Audit
    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('document_id_idx').on(table.documentId),
    index('document_version_idx').on(table.documentId, table.version),
    index('document_chunk_index_version_idx').on(table.documentId, table.indexVersionId),
    uniqueIndex('document_chunk_idx').on(table.documentId, table.indexVersionId, table.chunkIndex),
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [documents.id],
      name: 'document_chunks_document_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.indexVersionId],
      foreignColumns: [documentIndexVersions.id],
      name: 'document_chunks_index_version_id_fk',
    }).onDelete('cascade'),
  ]
);

// ==================== Relations ====================
export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
}));

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
