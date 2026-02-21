import { mysqlTable, varchar, text, timestamp, index } from 'drizzle-orm/mysql-core';

export const oauthExchangeCodes = mysqlTable(
  'oauth_exchange_codes',
  {
    code: varchar('code', { length: 36 }).primaryKey(),
    payload: text('payload').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    consumedAt: timestamp('consumed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('oauth_exchange_expires_idx').on(table.expiresAt),
    index('oauth_exchange_consumed_idx').on(table.consumedAt),
  ]
);

export type OAuthExchangeCode = typeof oauthExchangeCodes.$inferSelect;
export type NewOAuthExchangeCode = typeof oauthExchangeCodes.$inferInsert;
