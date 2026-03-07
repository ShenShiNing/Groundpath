import { z } from 'zod';

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
