import { z } from 'zod';

// ==================== Knowledge Base Schemas ====================

export const createKnowledgeBaseSchema = z.object({
  name: z
    .string()
    .min(1, 'Knowledge base name is required')
    .max(200, 'Knowledge base name must be at most 200 characters'),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .nullable()
    .optional(),
  embeddingProvider: z.enum(['zhipu', 'openai', 'ollama']),
});

export const updateKnowledgeBaseSchema = z.object({
  name: z
    .string()
    .min(1, 'Knowledge base name is required')
    .max(200, 'Knowledge base name must be at most 200 characters')
    .optional(),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .nullable()
    .optional(),
});

// ==================== Inferred Types ====================

export type CreateKnowledgeBaseRequest = z.infer<typeof createKnowledgeBaseSchema>;
export type UpdateKnowledgeBaseRequest = z.infer<typeof updateKnowledgeBaseSchema>;
