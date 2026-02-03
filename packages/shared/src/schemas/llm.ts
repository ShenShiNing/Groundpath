import { z } from 'zod';
import { LLM_PROVIDERS } from '../types/llm';

export const llmProviderSchema = z.enum(LLM_PROVIDERS);

export const updateLLMConfigSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).max(500).optional(),
  baseUrl: z
    .string()
    .url('Invalid URL format')
    .max(500)
    .nullable()
    .optional()
    .transform((val) => val || null),
  temperature: z.coerce.number().min(0).max(2).optional(),
  maxTokens: z.coerce.number().int().min(1).max(128000).optional(),
  topP: z.coerce.number().min(0).max(1).optional(),
});

export const testLLMConnectionSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).max(500).optional(),
  baseUrl: z.string().url('Invalid URL format').max(500).optional(),
});

export const fetchModelsSchema = z.object({
  provider: llmProviderSchema,
  apiKey: z.string().min(1).max(500).optional(),
  baseUrl: z.string().url('Invalid URL format').max(500).optional(),
});

export type UpdateLLMConfigInput = z.infer<typeof updateLLMConfigSchema>;
export type TestLLMConnectionInput = z.infer<typeof testLLMConnectionSchema>;
export type FetchModelsInput = z.infer<typeof fetchModelsSchema>;
