import { mysqlTable, varchar, timestamp, index, foreignKey } from 'drizzle-orm/mysql-core';
import { users } from '../user/users.schema';
import { knowledgeBases } from '../document/knowledge-bases.schema';

export const conversations = mysqlTable(
  'conversations',
  {
    // Primary key
    id: varchar('id', { length: 36 }).primaryKey(), // UUID

    // User reference
    userId: varchar('user_id', { length: 36 }).notNull(),

    // Optional knowledge base association
    knowledgeBaseId: varchar('knowledge_base_id', { length: 36 }),

    // Conversation metadata
    title: varchar('title', { length: 255 }).notNull(),

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
    index('kb_id_idx').on(table.knowledgeBaseId),
    index('deleted_at_idx').on(table.deletedAt),
    index('user_kb_idx').on(table.userId, table.knowledgeBaseId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'conversations_user_id_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.knowledgeBaseId],
      foreignColumns: [knowledgeBases.id],
      name: 'conversations_knowledge_base_id_fk',
    }).onDelete('set null'),
  ]
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
