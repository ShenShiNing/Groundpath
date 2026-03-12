import {
  mysqlTable,
  varchar,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  json,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { users } from '../user/users.schema';
import { relations } from 'drizzle-orm';

// ==================== 刷新Token表 ====================
export const refreshTokens = mysqlTable(
  'refresh_tokens',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),

    token: varchar('token', { length: 500 }).notNull(), // 长token

    // 设备信息
    deviceInfo: json('device_info').$type<{
      userAgent?: string;
      deviceType?: string;
      os?: string;
      browser?: string;
    }>(),

    ipAddress: varchar('ip_address', { length: 45 }),

    // Token状态
    revoked: boolean('revoked').notNull().default(false),
    revokedAt: timestamp('revoked_at'),

    expiresAt: timestamp('expires_at').notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_id_idx').on(table.userId),
    uniqueIndex('token_idx').on(table.token),
    index('expires_at_idx').on(table.expiresAt),
    index('revoked_idx').on(table.revoked),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'refresh_tokens_user_id_fk',
    }).onDelete('cascade'),
  ]
);

// ==================== Relations ====================
export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
