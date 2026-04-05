import {
  bigint,
  mysqlTable,
  varchar,
  timestamp,
  mysqlEnum,
  text,
  json,
  index,
  foreignKey,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { conversations } from './conversations.schema';
import type { MessageMetadata } from '@groundpath/shared/types';

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

    // Stable per-message order within the table. We use a database sequence so
    // edit-and-truncate semantics do not depend on second-level timestamps.
    sequence: bigint('sequence', { mode: 'number', unsigned: true }).notNull().autoincrement(),

    // Timestamp
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('conversation_id_idx').on(table.conversationId),
    index('conversation_created_idx').on(table.conversationId, table.createdAt),
    index('conversation_sequence_idx').on(table.conversationId, table.sequence),
    uniqueIndex('messages_sequence_unique_idx').on(table.sequence),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: 'messages_conversation_id_fk',
    }).onDelete('cascade'),
  ]
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
