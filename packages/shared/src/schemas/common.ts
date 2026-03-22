import { z } from 'zod';

/**
 * Common parameter schemas for route validation
 */
export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

export const dateTimeStringSchema = z.string().datetime();

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export type IdParam = z.infer<typeof idParamSchema>;
