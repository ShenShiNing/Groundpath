import {
  mysqlTable,
  varchar,
  timestamp,
  boolean,
  index,
  mysqlEnum,
  text,
} from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from '../user/users.schema';

export const loginLogs = mysqlTable(
  'login_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }),

    email: varchar('email', { length: 255 }),

    // 登录方式
    authType: mysqlEnum('auth_type', ['email', 'github', 'wechat', 'google', 'password']).notNull(),

    // 登录结果
    success: boolean('success').notNull(),
    failureReason: varchar('failure_reason', { length: 255 }),

    // 设备和位置信息 (原有)
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    location: varchar('location', { length: 100 }), // 城市/国家 (legacy, kept for compatibility)

    // 设备信息 (新增)
    deviceType: varchar('device_type', { length: 50 }), // desktop, mobile, tablet, etc.
    browser: varchar('browser', { length: 50 }),
    browserVersion: varchar('browser_version', { length: 20 }),
    os: varchar('os', { length: 50 }),
    osVersion: varchar('os_version', { length: 20 }),

    // 地理位置信息 (新增)
    country: varchar('country', { length: 2 }), // ISO 3166-1 alpha-2 code
    countryName: varchar('country_name', { length: 100 }),
    region: varchar('region', { length: 100 }),
    city: varchar('city', { length: 100 }),
    timezone: varchar('timezone', { length: 50 }),
    isp: varchar('isp', { length: 100 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_id_idx').on(table.userId),
    index('email_idx').on(table.email),
    index('success_idx').on(table.success),
    index('created_at_idx').on(table.createdAt),
  ]
);

// ==================== Relations ====================
export const loginLogsRelations = relations(loginLogs, ({ one }) => ({
  user: one(users, {
    fields: [loginLogs.userId],
    references: [users.id],
  }),
}));

export type LoginLog = typeof loginLogs.$inferSelect;
export type NewLoginLog = typeof loginLogs.$inferInsert;
