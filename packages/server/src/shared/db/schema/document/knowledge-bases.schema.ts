import {
  mysqlTable,
  varchar,
  timestamp,
  index,
  text,
  int,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from '../user/users.schema';
import { documents } from './documents.schema';

export const knowledgeBases = mysqlTable(
  'knowledge_bases',
  {
    id: varchar('id', { length: 36 }).primaryKey(), // UUID

    // Ownership
    userId: varchar('user_id', { length: 36 }).notNull(),

    // Knowledge base info
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),

    // Embedding configuration (immutable after creation)
    embeddingProvider: varchar('embedding_provider', { length: 20 }).notNull(),
    embeddingModel: varchar('embedding_model', { length: 100 }).notNull(),
    embeddingDimensions: int('embedding_dimensions').notNull(),

    // Counters
    documentCount: int('document_count').notNull().default(0),
    totalChunks: int('total_chunks').notNull().default(0),

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
    index('deleted_at_idx').on(table.deletedAt),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'knowledge_bases_user_id_fk',
    }).onDelete('restrict'),
  ]
);

// ==================== Relations ====================
export const knowledgeBasesRelations = relations(knowledgeBases, ({ one, many }) => ({
  user: one(users, {
    fields: [knowledgeBases.userId],
    references: [users.id],
  }),
  documents: many(documents),
}));

export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBases.$inferInsert;
