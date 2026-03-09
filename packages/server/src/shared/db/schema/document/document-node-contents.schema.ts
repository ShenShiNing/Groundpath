import { index, int, longtext, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';
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

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('document_node_content_version_idx').on(table.documentId, table.indexVersionId),
    index('document_node_content_node_idx').on(table.indexVersionId, table.nodeId),
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
