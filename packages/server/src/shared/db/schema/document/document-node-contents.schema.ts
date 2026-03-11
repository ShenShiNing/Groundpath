import {
  index,
  int,
  longtext,
  mysqlTable,
  text,
  timestamp,
  varchar,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { documents } from './documents.schema';
import { documentIndexVersions } from './document-index-versions.schema';
import { documentNodes } from './document-nodes.schema';

export const documentNodeContents = mysqlTable(
  'document_node_contents',
  {
    nodeId: varchar('node_id', { length: 36 }).primaryKey(),

    // Reference
    documentId: varchar('document_id', { length: 36 }).notNull(),
    indexVersionId: varchar('index_version_id', { length: 36 }).notNull(),

    // Content
    content: longtext('content').notNull(),
    contentPreview: text('content_preview'),
    tokenCount: int('token_count'),

    // Image description (figure nodes only)
    imageDescription: text('image_description'),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('document_node_content_version_idx').on(table.documentId, table.indexVersionId),
    index('document_node_content_node_idx').on(table.indexVersionId, table.nodeId),
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [documents.id],
      name: 'document_node_contents_document_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.indexVersionId],
      foreignColumns: [documentIndexVersions.id],
      name: 'document_node_contents_index_version_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.nodeId],
      foreignColumns: [documentNodes.id],
      name: 'document_node_contents_node_id_fk',
    }).onDelete('cascade'),
  ]
);

export const documentNodeContentsRelations = relations(documentNodeContents, ({ one }) => ({
  document: one(documents, {
    fields: [documentNodeContents.documentId],
    references: [documents.id],
  }),
  indexVersion: one(documentIndexVersions, {
    fields: [documentNodeContents.indexVersionId],
    references: [documentIndexVersions.id],
  }),
  node: one(documentNodes, {
    fields: [documentNodeContents.nodeId],
    references: [documentNodes.id],
  }),
}));

export type DocumentNodeContent = typeof documentNodeContents.$inferSelect;
export type NewDocumentNodeContent = typeof documentNodeContents.$inferInsert;
