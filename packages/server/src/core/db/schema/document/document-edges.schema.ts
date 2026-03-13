import {
  index,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { documents } from './documents.schema';
import { documentIndexVersions } from './document-index-versions.schema';
import { documentNodes } from './document-nodes.schema';

export const documentEdges = mysqlTable(
  'document_edges',
  {
    id: varchar('id', { length: 36 }).primaryKey(),

    // Reference
    documentId: varchar('document_id', { length: 36 }).notNull(),
    indexVersionId: varchar('index_version_id', { length: 36 }).notNull(),

    // Edge info
    fromNodeId: varchar('from_node_id', { length: 36 }).notNull(),
    toNodeId: varchar('to_node_id', { length: 36 }).notNull(),
    edgeType: mysqlEnum('edge_type', ['parent', 'next', 'refers_to', 'cites']).notNull(),
    anchorText: varchar('anchor_text', { length: 500 }),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('document_edge_unique_idx').on(
      table.indexVersionId,
      table.fromNodeId,
      table.toNodeId,
      table.edgeType
    ),
    index('document_edge_from_idx').on(table.indexVersionId, table.fromNodeId),
    index('document_edge_to_idx').on(table.indexVersionId, table.toNodeId),
    index('document_edge_document_idx').on(table.documentId, table.indexVersionId),
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [documents.id],
      name: 'document_edges_document_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.indexVersionId],
      foreignColumns: [documentIndexVersions.id],
      name: 'document_edges_index_version_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.fromNodeId],
      foreignColumns: [documentNodes.id],
      name: 'document_edges_from_node_id_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.toNodeId],
      foreignColumns: [documentNodes.id],
      name: 'document_edges_to_node_id_fk',
    }).onDelete('cascade'),
  ]
);

export const documentEdgesRelations = relations(documentEdges, ({ one }) => ({
  document: one(documents, {
    fields: [documentEdges.documentId],
    references: [documents.id],
  }),
  indexVersion: one(documentIndexVersions, {
    fields: [documentEdges.indexVersionId],
    references: [documentIndexVersions.id],
  }),
}));

export type DocumentEdge = typeof documentEdges.$inferSelect;
export type NewDocumentEdge = typeof documentEdges.$inferInsert;
