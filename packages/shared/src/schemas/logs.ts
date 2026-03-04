import { z } from 'zod';

/**
 * Common pagination schema for log queries (internal)
 */
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Date range filter schema (internal)
 */
const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

/**
 * Login log query params
 */
export const loginLogQuerySchema = paginationSchema.extend(dateRangeSchema.shape).extend({
  success: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  authType: z.enum(['email', 'github', 'wechat', 'google', 'password']).optional(),
});

export type LoginLogQueryParams = z.infer<typeof loginLogQuerySchema>;

/**
 * Operation log query params
 */
export const operationLogQuerySchema = paginationSchema.extend(dateRangeSchema.shape).extend({
  resourceType: z.enum(['document', 'knowledge_base', 'user', 'session']).optional(),
  action: z
    .enum([
      'document.upload',
      'document.update',
      'document.delete',
      'document.restore',
      'document.permanent_delete',
      'document.download',
      'document.upload_version',
      'document.restore_version',
      'knowledge_base.create',
      'knowledge_base.update',
      'knowledge_base.delete',
      'user.change_password',
      'session.logout',
      'session.logout_all',
      'session.revoke',
    ])
    .optional(),
});

export type OperationLogQueryParams = z.infer<typeof operationLogQuerySchema>;

/**
 * Resource history params
 */
export const resourceHistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ResourceHistoryParams = z.infer<typeof resourceHistorySchema>;
