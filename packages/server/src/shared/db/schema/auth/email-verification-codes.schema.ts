import { mysqlTable, varchar, timestamp, mysqlEnum, index, boolean } from 'drizzle-orm/mysql-core';

export const emailVerificationCodes = mysqlTable(
  'email_verification_codes',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    code: varchar('code', { length: 6 }).notNull(), // 6位数字验证码

    // 验证码类型：register, login, reset_password, change_email
    type: mysqlEnum('type', ['register', 'login', 'reset_password', 'change_email']).notNull(),

    // 验证码状态
    used: boolean('used').notNull().default(false),
    usedAt: timestamp('used_at'),

    // 过期时间
    expiresAt: timestamp('expires_at').notNull(),

    // IP地址
    ipAddress: varchar('ip_address', { length: 45 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('email_idx').on(table.email),
    index('code_idx').on(table.code),
    index('expires_at_idx').on(table.expiresAt),
    index('used_idx').on(table.used),
  ]
);

export type EmailVerificationCode = typeof emailVerificationCodes.$inferSelect;
export type NewEmailVerificationCode = typeof emailVerificationCodes.$inferInsert;
