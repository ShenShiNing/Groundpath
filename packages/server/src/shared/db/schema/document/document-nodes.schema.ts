import {
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { documents } from './documents.schema';
import { documentIndexVersions } from './document-index-versions.schema';

export const documentNodes = mysqlTable(
  'document_nodes',
  {
    id: varchar('id', { length: 36 }).primaryKey(),

    // Reference
    documentId: varchar('document_id', { length: 36 }).notNull(),
    indexVersionId: varchar('index_version_id', { length: 36 }).notNull(),

    // Node info
    nodeType: mysqlEnum('node_type', [
      'document',
      'chapter',
      'section',
      'paragraph',
      'table',
      'figure',
      'appendix',
    ])
      .notNull()
      .default('section'),
    title: varchar('title', { length: 500 }),
    depth: int('depth').notNull().default(0),
    sectionPath: json('section_path').$type<string[]>(),
    pageStart: int('page_start'),
    pageEnd: int('page_end'),
    parentId: varchar('parent_id', { length: 36 }),
    orderNo: int('order_no').notNull(),
    tokenCount: int('token_count'),
    stableLocator: varchar('stable_locator', { length: 500 }),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('document_node_order_idx').on(table.indexVersionId, table.orderNo),
    index('document_node_document_idx').on(table.documentId, table.indexVersionId),
    index('document_node_parent_idx').on(table.indexVersionId, table.parentId),
    index('document_node_type_idx').on(table.indexVersionId, table.nodeType),
  ]
);

export const documentNodesRelations = relations(documentNodes, ({ one }) => ({
  document: one(documents, {
    fields: [documentNodes.documentId],
    references: [documents.id],
  }),
  indexVersion: one(documentIndexVersions, {
    fields: [documentNodes.indexVersionId],
    references: [documentIndexVersions.id],
  }),
}));

export type DocumentNode = typeof documentNodes.$inferSelect;
export type NewDocumentNode = typeof documentNodes.$inferInsert;
