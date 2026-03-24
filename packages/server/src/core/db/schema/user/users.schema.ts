import {
  mysqlTable,
  varchar,
  timestamp,
  mysqlEnum,
  boolean,
  index,
  uniqueIndex,
  text,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const users = mysqlTable(
  'users',
  {
    // Primary key
    id: varchar('id', { length: 36 }).primaryKey(), // UUID

    // Auth info
    username: varchar('username', { length: 50 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    password: varchar('password', { length: 255 }), // 可为null，第三方登录用户无密码
    activeUsername: varchar('active_username', { length: 50 }).generatedAlwaysAs(
      sql`(case when deleted_at is null then username else null end)`,
      { mode: 'stored' }
    ),
    activeEmail: varchar('active_email', { length: 255 }).generatedAlwaysAs(
      sql`(case when deleted_at is null then email else null end)`,
      { mode: 'stored' }
    ),

    // Profile
    avatarUrl: text('avatar_url'),
    bio: text('bio'),

    // User status
    status: mysqlEnum('status', ['active', 'inactive', 'banned']).notNull().default('inactive'),

    // Email verification
    emailVerified: boolean('email_verified').notNull().default(false),
    emailVerifiedAt: timestamp('email_verified_at'),

    // Login tracking
    lastLoginAt: timestamp('last_login_at'),
    lastLoginIp: varchar('last_login_ip', { length: 45 }), // IPv6支持

    // Audit fields
    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedBy: varchar('updated_by', { length: 36 }),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedBy: varchar('deleted_by', { length: 36 }),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('status_idx').on(table.status),
    index('deleted_at_idx').on(table.deletedAt),
    index('email_verified_idx').on(table.emailVerified),
    uniqueIndex('users_active_username_idx').on(table.activeUsername),
    uniqueIndex('users_active_email_idx').on(table.activeEmail),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
