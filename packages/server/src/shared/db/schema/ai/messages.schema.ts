import {
  mysqlTable,
  varchar,
  timestamp,
  mysqlEnum,
  text,
  json,
  index,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { conversations } from './conversations.schema';
import type { MessageMetadata } from '@knowledge-agent/shared/types';

export const messages = mysqlTable(
  'messages',
  {
    // Primary key
    id: varchar('id', { length: 36 }).primaryKey(), // UUID

    // Conversation reference
    conversationId: varchar('conversation_id', { length: 36 }).notNull(),

    // Message content
    role: mysqlEnum('role', ['user', 'assistant', 'system']).notNull(),
    content: text('content').notNull(),

    // Metadata (citations, token usage, etc.)
    metadata: json('metadata').$type<MessageMetadata>(),

    // Timestamp
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('conversation_id_idx').on(table.conversationId),
    index('conversation_created_idx').on(table.conversationId, table.createdAt),
  ]
);

// ==================== Relations ====================
export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
