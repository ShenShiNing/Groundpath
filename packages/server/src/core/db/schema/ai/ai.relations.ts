import { relations } from 'drizzle-orm';
import { knowledgeBases } from '../document/knowledge-bases.schema';
import { users } from '../user/users.schema';
import { conversations } from './conversations.schema';
import { messages } from './messages.schema';

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  knowledgeBase: one(knowledgeBases, {
    fields: [conversations.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));
