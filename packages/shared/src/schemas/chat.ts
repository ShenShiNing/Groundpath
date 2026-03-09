import { z } from 'zod';
import { AGENT_STOP_REASONS } from '../types/chat';

export const chunkCitationSchema = z.object({
  sourceType: z.literal('chunk'),
  documentId: z.string().min(1),
  documentTitle: z.string().min(1),
  documentVersion: z.number().int().positive().optional(),
  indexVersion: z.string().min(1).optional(),
  chunkIndex: z.number().int().min(0),
  content: z.string(),
  pageNumber: z.number().int().positive().optional(),
  pageStart: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
  sectionPath: z.array(z.string().min(1)).optional(),
  locator: z.string().min(1).optional(),
  excerpt: z.string().optional(),
  score: z.number().finite().optional(),
});

export const nodeCitationSchema = z.object({
  sourceType: z.literal('node'),
  documentId: z.string().min(1),
  documentTitle: z.string().min(1),
  documentVersion: z.number().int().positive().optional(),
  indexVersion: z.string().min(1).optional(),
  nodeId: z.string().min(1),
  content: z.string().optional(),
  pageStart: z.number().int().positive().optional(),
  pageEnd: z.number().int().positive().optional(),
  sectionPath: z.array(z.string().min(1)).optional(),
  locator: z.string().min(1).optional(),
  excerpt: z.string().min(1),
  score: z.number().finite().optional(),
});

export const citationSchema = z.discriminatedUnion('sourceType', [
  chunkCitationSchema,
  nodeCitationSchema,
]);

export const tokenUsageSchema = z.object({
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
});

export const toolCallInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
});

export const toolResultInfoSchema = z.object({
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  content: z.string(),
  isError: z.boolean().optional(),
});

export const agentStepSchema = z.object({
  toolCalls: z.array(toolCallInfoSchema),
  toolResults: z.array(toolResultInfoSchema),
  durationMs: z.number().int().min(0).optional(),
});

export const messageMetadataSchema = z.object({
  citations: z.array(citationSchema).optional(),
  retrievedSources: z.array(citationSchema).optional(),
  finalCitations: z.array(citationSchema).optional(),
  tokenUsage: tokenUsageSchema.optional(),
  agentTrace: z.array(agentStepSchema).optional(),
  stopReason: z.enum(AGENT_STOP_REASONS).optional(),
});

export const createConversationSchema = z.object({
  knowledgeBaseId: z.string().uuid().optional(),
  title: z.string().min(1).max(255).optional(),
});

export const updateConversationSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    knowledgeBaseId: z.string().uuid().nullable().optional(),
  })
  .refine((data) => data.title !== undefined || data.knowledgeBaseId !== undefined, {
    message: 'At least one field must be provided',
  });

export const sendMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(32000, 'Message is too long (max 32000 characters)'),
  documentIds: z.array(z.string().uuid()).max(20).optional(),
});

export const listConversationsSchema = z.object({
  knowledgeBaseId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const searchConversationsSchema = z.object({
  query: z.string().trim().min(2, 'Search query must be at least 2 characters').max(100),
  knowledgeBaseId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListConversationsInput = z.infer<typeof listConversationsSchema>;
export type ListMessagesInput = z.infer<typeof listMessagesSchema>;
export type SearchConversationsInput = z.infer<typeof searchConversationsSchema>;
