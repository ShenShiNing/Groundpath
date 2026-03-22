import { z } from 'zod';
import { dateTimeStringSchema, paginationMetaSchema } from './common';

// ==================== Knowledge Base Schemas ====================

export const embeddingProviderSchema = z.enum(['zhipu', 'openai', 'ollama']);

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
  embeddingProvider: embeddingProviderSchema,
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

export const knowledgeBaseListParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// ==================== Response Schemas ====================

export const knowledgeBaseInfoResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  embeddingProvider: embeddingProviderSchema,
  embeddingModel: z.string(),
  embeddingDimensions: z.number().int().positive(),
  documentCount: z.number().int().nonnegative(),
  totalChunks: z.number().int().nonnegative(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

export const knowledgeBaseListItemResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  embeddingProvider: embeddingProviderSchema,
  embeddingModel: z.string(),
  embeddingDimensions: z.number().int().positive(),
  documentCount: z.number().int().nonnegative(),
  totalChunks: z.number().int().nonnegative(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

export const knowledgeBaseListResponseSchema = z.object({
  knowledgeBases: z.array(knowledgeBaseListItemResponseSchema),
  pagination: paginationMetaSchema,
});

// ==================== Inferred Types ====================

export type CreateKnowledgeBaseRequest = z.infer<typeof createKnowledgeBaseSchema>;
export type UpdateKnowledgeBaseRequest = z.infer<typeof updateKnowledgeBaseSchema>;
export type KnowledgeBaseListParams = z.infer<typeof knowledgeBaseListParamsSchema>;
