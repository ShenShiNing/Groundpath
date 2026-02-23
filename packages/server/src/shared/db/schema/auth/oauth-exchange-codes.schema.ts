import { mysqlTable, varchar, timestamp, index } from 'drizzle-orm/mysql-core';

export const oauthExchangeCodes = mysqlTable(
  'oauth_exchange_codes',
  {
    codeHash: varchar('code_hash', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    returnUrl: varchar('return_url', { length: 1000 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('oauth_exchange_user_idx').on(table.userId),
    index('oauth_exchange_expires_idx').on(table.expiresAt),
    index('oauth_exchange_consumed_idx').on(table.consumedAt),
  ]
);

export type OAuthExchangeCode = typeof oauthExchangeCodes.$inferSelect;
export type NewOAuthExchangeCode = typeof oauthExchangeCodes.$inferInsert;
