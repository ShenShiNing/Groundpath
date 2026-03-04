import { z } from 'zod';

// ==================== Document Schemas ====================

export const documentTypeSchema = z.enum(['pdf', 'markdown', 'text', 'docx', 'other']);

export const updateDocumentRequestSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be at most 255 characters')
    .optional(),
  description: z
    .string()
    .max(2000, 'Description must be at most 2000 characters')
    .nullable()
    .optional(),
});

export const saveDocumentContentSchema = z.object({
  content: z.string().max(500000, 'Content too large'),
  changeNote: z.string().max(255).optional(),
});

// ==================== Query Schemas ====================

export const documentListParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  knowledgeBaseId: z.string().uuid().optional(),
  documentType: documentTypeSchema.optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title', 'fileSize']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ==================== Trash Schemas ====================

export const trashListParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['deletedAt', 'title', 'fileSize']).default('deletedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ==================== Inferred Types ====================

export type UpdateDocumentRequest = z.infer<typeof updateDocumentRequestSchema>;
export type SaveDocumentContentRequest = z.infer<typeof saveDocumentContentSchema>;
export type DocumentListParams = z.infer<typeof documentListParamsSchema>;
export type TrashListParams = z.infer<typeof trashListParamsSchema>;
