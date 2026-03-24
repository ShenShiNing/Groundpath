import {
  mysqlTable,
  varchar,
  timestamp,
  mysqlEnum,
  index,
  uniqueIndex,
  json,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { users } from '../user/users.schema';

// ==================== 用户认证方式表 ====================
export const userAuths = mysqlTable(
  'user_auths',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),

    // 认证类型：email, github, wechat, google
    authType: mysqlEnum('auth_type', ['email', 'github', 'wechat', 'google', 'password']).notNull(),

    // 第三方平台的唯一ID
    authId: varchar('auth_id', { length: 255 }).notNull(),

    // 第三方返回的额外数据
    authData: json('auth_data').$type<{
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
      profile?: Record<string, unknown>;
    }>(),

    // Audit fields
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index('user_id_idx').on(table.userId),
    // 同一个认证方式的authId必须唯一（比如同一个GitHub账号只能绑定一个用户）
    uniqueIndex('auth_type_id_idx').on(table.authType, table.authId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_auths_user_id_fk',
    }).onDelete('cascade'),
  ]
);

export type UserAuth = typeof userAuths.$inferSelect;
export type NewUserAuth = typeof userAuths.$inferInsert;
