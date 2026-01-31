import { z } from 'zod';

/**
 * Common parameter schemas for route validation
 */
export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

export type IdParam = z.infer<typeof idParamSchema>;
