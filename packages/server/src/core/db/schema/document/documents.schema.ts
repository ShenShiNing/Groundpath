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
import { knowledgeBases } from './knowledge-bases.schema';

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
    index('documents_user_deleted_created_id_idx').on(
      table.userId,
      table.deletedAt,
      table.createdAt,
      table.id
    ),
    index('documents_user_deleted_title_id_idx').on(
      table.userId,
      table.deletedAt,
      table.title,
      table.id
    ),
    index('documents_user_deleted_file_size_id_idx').on(
      table.userId,
      table.deletedAt,
      table.fileSize,
      table.id
    ),
    index('documents_user_deleted_at_id_idx').on(table.userId, table.deletedAt, table.id),
    index('documents_user_deleted_updated_id_idx').on(
      table.userId,
      table.deletedAt,
      table.updatedAt,
      table.id
    ),
    index('documents_kb_deleted_created_id_idx').on(
      table.knowledgeBaseId,
      table.deletedAt,
      table.createdAt,
      table.id
    ),
    index('documents_kb_deleted_title_id_idx').on(
      table.knowledgeBaseId,
      table.deletedAt,
      table.title,
      table.id
    ),
    index('documents_kb_deleted_file_size_id_idx').on(
      table.knowledgeBaseId,
      table.deletedAt,
      table.fileSize,
      table.id
    ),
    index('documents_kb_deleted_updated_id_idx').on(
      table.knowledgeBaseId,
      table.deletedAt,
      table.updatedAt,
      table.id
    ),
    foreignKey({
      columns: [table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.id],
      name: 'documents_knowledge_base_id_fk',
    }).onDelete('cascade'),
  ]
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
