import {
  mysqlTable,
  varchar,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
  longtext,
  bigint,
  int,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { documents } from './documents.schema';

export const documentVersions = mysqlTable(
  'document_versions',
  {
    id: varchar('id', { length: 36 }).primaryKey(), // UUID

    // Reference to the document
    documentId: varchar('document_id', { length: 36 }).notNull(),

    // Version info
    version: int('version').notNull(),

    // File info
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    fileExtension: varchar('file_extension', { length: 20 }).notNull(),
    documentType: mysqlEnum('document_type', ['pdf', 'markdown', 'text', 'docx', 'other'])
      .notNull()
      .default('other'),

    // Storage
    storageKey: varchar('storage_key', { length: 500 }).notNull(),

    // Content
    textContent: longtext('text_content'),
    wordCount: int('word_count'),

    // Version metadata
    source: mysqlEnum('source', ['upload', 'edit', 'ai_generate', 'restore'])
      .notNull()
      .default('upload'),
    changeNote: varchar('change_note', { length: 255 }),

    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('document_version_idx').on(table.documentId, table.version),
    index('document_id_idx').on(table.documentId),
    index('created_at_idx').on(table.createdAt),
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [documents.id],
      name: 'document_versions_document_id_fk',
    }).onDelete('cascade'),
  ]
);

export type DocumentVersion = typeof documentVersions.$inferSelect;
export type NewDocumentVersion = typeof documentVersions.$inferInsert;
