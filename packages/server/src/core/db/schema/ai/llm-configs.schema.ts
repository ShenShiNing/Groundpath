import {
  mysqlTable,
  varchar,
  timestamp,
  mysqlEnum,
  text,
  decimal,
  int,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from '../user/users.schema';

export const llmConfigs = mysqlTable(
  'llm_configs',
  {
    // Primary key
    id: varchar('id', { length: 36 }).primaryKey(), // UUID

    // User reference (one config per user)
    userId: varchar('user_id', { length: 36 }).notNull(),

    // Provider configuration
    provider: mysqlEnum('provider', [
      'openai',
      'anthropic',
      'zhipu',
      'deepseek',
      'ollama',
      'custom',
    ]).notNull(),
    model: varchar('model', { length: 100 }).notNull(),

    // API key (encrypted with AES-256-GCM)
    // Format: iv:authTag:ciphertext (all base64 encoded)
    apiKeyEncrypted: text('api_key_encrypted'),

    // Custom base URL for self-hosted or proxy endpoints
    baseUrl: varchar('base_url', { length: 500 }),

    // Generation parameters
    temperature: decimal('temperature', { precision: 3, scale: 2 }).notNull().default('0.70'),
    maxTokens: int('max_tokens').notNull().default(2048),
    topP: decimal('top_p', { precision: 3, scale: 2 }).notNull().default('1.00'),

    // Audit fields
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    // One LLM config per user
    uniqueIndex('user_id_idx').on(table.userId),
  ]
);

// ==================== Relations ====================
export const llmConfigsRelations = relations(llmConfigs, ({ one }) => ({
  user: one(users, {
    fields: [llmConfigs.userId],
    references: [users.id],
  }),
}));

export type LLMConfig = typeof llmConfigs.$inferSelect;
export type NewLLMConfig = typeof llmConfigs.$inferInsert;
