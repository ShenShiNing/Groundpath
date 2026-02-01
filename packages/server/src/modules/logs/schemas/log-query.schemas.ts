import { z } from '@knowledge-agent/shared/schemas';

// Common pagination params
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Date range filter
const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// Login log query params
export const loginLogQuerySchema = paginationSchema.merge(dateRangeSchema).extend({
  success: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  authType: z.enum(['email', 'github', 'wechat', 'google', 'password']).optional(),
});

export type LoginLogQueryParams = z.infer<typeof loginLogQuerySchema>;

// Operation log query params
export const operationLogQuerySchema = paginationSchema.merge(dateRangeSchema).extend({
  resourceType: z.enum(['document', 'folder', 'user', 'session']).optional(),
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
      'folder.create',
      'folder.update',
      'folder.delete',
      'user.change_password',
      'session.logout',
      'session.logout_all',
      'session.revoke',
    ])
    .optional(),
});

export type OperationLogQueryParams = z.infer<typeof operationLogQuerySchema>;

// Resource history params
export const resourceHistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ResourceHistoryParams = z.infer<typeof resourceHistorySchema>;
