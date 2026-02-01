import { z } from 'zod';

// ==================== Folder Schemas ====================

export const createFolderRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Folder name is required')
    .max(100, 'Folder name must be at most 100 characters'),
  parentId: z.string().uuid().nullable().optional(),
  knowledgeBaseId: z.string().uuid(),
});

export const updateFolderRequestSchema = z.object({
  name: z
    .string()
    .min(1, 'Folder name is required')
    .max(100, 'Folder name must be at most 100 characters')
    .optional(),
  parentId: z.string().uuid().nullable().optional(),
});

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
  folderId: z.string().uuid().nullable().optional(),
});

// ==================== Query Schemas ====================

export const documentListParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  folderId: z.string().uuid().nullable().optional(),
  knowledgeBaseId: z.string().uuid().optional(),
  documentType: documentTypeSchema.optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title', 'fileSize']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const folderIdParamSchema = z.object({
  folderId: z.string().uuid().optional(),
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

export type CreateFolderRequest = z.infer<typeof createFolderRequestSchema>;
export type UpdateFolderRequest = z.infer<typeof updateFolderRequestSchema>;
export type UpdateDocumentRequest = z.infer<typeof updateDocumentRequestSchema>;
export type DocumentListParams = z.infer<typeof documentListParamsSchema>;
export type TrashListParams = z.infer<typeof trashListParamsSchema>;
