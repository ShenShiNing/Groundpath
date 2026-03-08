import { z } from 'zod';

// ==================== Request Schemas ====================

export const ragSearchRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  knowledgeBaseId: z.string().uuid(),
  limit: z.coerce.number().min(1).max(50).default(5),
  scoreThreshold: z.coerce.number().min(0).max(1).optional(),
  documentIds: z.array(z.string()).optional(),
});

// ==================== Inferred Types ====================

export type RagSearchRequest = z.infer<typeof ragSearchRequestSchema>;
