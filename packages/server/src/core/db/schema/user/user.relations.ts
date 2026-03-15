import { relations } from 'drizzle-orm';
import { loginLogs } from '../system/login-logs.schema';
import { refreshTokens } from '../auth/refresh-tokens.schema';
import { userAuths } from '../auth/user-auths.schema';
import { users } from './users.schema';

export const usersRelations = relations(users, ({ many }) => ({
  auths: many(userAuths),
  refreshTokens: many(refreshTokens),
  loginLogs: many(loginLogs),
}));

export const userAuthsRelations = relations(userAuths, ({ one }) => ({
  user: one(users, {
    fields: [userAuths.userId],
    references: [users.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const loginLogsRelations = relations(loginLogs, ({ one }) => ({
  user: one(users, {
    fields: [loginLogs.userId],
    references: [users.id],
  }),
}));
