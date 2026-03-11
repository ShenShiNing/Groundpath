import {
  mysqlTable,
  varchar,
  timestamp,
  mysqlEnum,
  index,
  text,
  bigint,
  int,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from '../user/users.schema';
import { documentVersions } from './document-versions.schema';
import { documentChunks } from './document-chunks.schema';
import { knowledgeBases } from './knowledge-bases.schema';
import { documentIndexVersions } from './document-index-versions.schema';

export const documents = mysqlTable(
  'documents',
  {
    id: varchar('id', { length: 36 }).primaryKey(), // UUID

    // Ownership
    userId: varchar('user_id', { length: 36 }).notNull(),

    // Knowledge base association
    knowledgeBaseId: varchar('knowledge_base_id', { length: 36 }).notNull(),

    // Document info
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),

    // Version pointer
    currentVersion: int('current_version').notNull().default(1),
    activeIndexVersionId: varchar('active_index_version_id', { length: 36 }),

    // Cached fields (from current version, for list display without JOIN)
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    fileExtension: varchar('file_extension', { length: 20 }).notNull(),
    documentType: mysqlEnum('document_type', ['pdf', 'markdown', 'text', 'docx', 'other'])
      .notNull()
      .default('other'),

    // AI processing status
    processingStatus: mysqlEnum('processing_status', [
      'pending',
      'processing',
      'completed',
      'failed',
    ])
      .notNull()
      .default('pending'),
    processingError: text('processing_error'),
    processingStartedAt: timestamp('processing_started_at'),
    publishGeneration: int('publish_generation').notNull().default(0),
    chunkCount: int('chunk_count').notNull().default(0),

    // Audit fields
    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedBy: varchar('updated_by', { length: 36 }),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedBy: varchar('deleted_by', { length: 36 }),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('user_id_idx').on(table.userId),
    index('knowledge_base_id_idx').on(table.knowledgeBaseId),
    index('processing_status_idx').on(table.processingStatus),
    index('active_index_version_id_idx').on(table.activeIndexVersionId),
    index('deleted_at_idx').on(table.deletedAt),
    index('created_at_idx').on(table.createdAt),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'documents_user_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.id],
      name: 'documents_knowledge_base_id_fk',
    }).onDelete('cascade'),
  ]
);

// ==================== Relations ====================
export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  knowledgeBase: one(knowledgeBases, {
    fields: [documents.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
  versions: many(documentVersions),
  chunks: many(documentChunks),
  indexVersions: many(documentIndexVersions),
}));

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
