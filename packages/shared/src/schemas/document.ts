import { z } from 'zod';
import { dateTimeStringSchema, paginationMetaSchema } from './common';

// ==================== Document Schemas ====================

export const documentTypeSchema = z.enum(['pdf', 'markdown', 'text', 'docx', 'other']);
export const processingStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export const versionSourceSchema = z.enum(['upload', 'edit', 'ai_generate', 'restore']);

const documentTitleSchema = z
  .string()
  .min(1, 'Title is required')
  .max(255, 'Title must be at most 255 characters');

const documentDescriptionSchema = z
  .string()
  .max(2000, 'Description must be at most 2000 characters')
  .nullable();

const changeNoteSchema = z.string().max(255);

export const updateDocumentRequestSchema = z.object({
  title: documentTitleSchema.optional(),
  description: documentDescriptionSchema.optional(),
});

export const saveDocumentContentSchema = z.object({
  content: z.string().max(500000, 'Content too large'),
  changeNote: changeNoteSchema.optional(),
});

export const documentUploadMetadataSchema = z.object({
  knowledgeBaseId: z.string().uuid(),
  title: documentTitleSchema.optional(),
  description: documentDescriptionSchema.optional(),
});

export const knowledgeBaseDocumentUploadMetadataSchema = z.object({
  title: documentTitleSchema.optional(),
  description: documentDescriptionSchema.optional(),
});

export const documentVersionUploadMetadataSchema = z.object({
  changeNote: changeNoteSchema.optional(),
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

export const knowledgeBaseDocumentListParamsSchema = documentListParamsSchema.omit({
  knowledgeBaseId: true,
});

// ==================== Trash Schemas ====================

export const trashListParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['deletedAt', 'title', 'fileSize']).default('deletedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ==================== Response Schemas ====================

export const documentInfoResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int().nonnegative(),
  fileExtension: z.string(),
  documentType: documentTypeSchema,
  currentVersion: z.number().int().positive(),
  processingStatus: processingStatusSchema,
  chunkCount: z.number().int().nonnegative(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

export const documentListItemResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  fileName: z.string(),
  fileSize: z.number().int().nonnegative(),
  fileExtension: z.string(),
  documentType: documentTypeSchema,
  processingStatus: processingStatusSchema,
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
});

export const trashDocumentListItemResponseSchema = documentListItemResponseSchema.extend({
  deletedAt: dateTimeStringSchema,
});

export const documentListResponseSchema = z.object({
  documents: z.array(documentListItemResponseSchema),
  pagination: paginationMetaSchema,
});

export const trashListResponseSchema = z.object({
  documents: z.array(trashDocumentListItemResponseSchema),
  pagination: paginationMetaSchema,
});

export const documentMutationResponseSchema = z.object({
  document: documentInfoResponseSchema,
  message: z.string(),
});

export const clearTrashResponseSchema = z.object({
  deletedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  message: z.string(),
});

export const documentContentResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  fileName: z.string(),
  documentType: documentTypeSchema,
  textContent: z.string().nullable(),
  currentVersion: z.number().int().positive(),
  processingStatus: processingStatusSchema,
  isEditable: z.boolean(),
  isTruncated: z.boolean(),
  storageUrl: z.string().nullable(),
});

export const documentVersionListItemResponseSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  fileName: z.string(),
  fileSize: z.number().int().nonnegative(),
  source: versionSourceSchema,
  changeNote: z.string().nullable(),
  createdAt: dateTimeStringSchema,
});

export const versionListResponseSchema = z.object({
  versions: z.array(documentVersionListItemResponseSchema),
  currentVersion: z.number().int().positive(),
});

// ==================== Inferred Types ====================

export type UpdateDocumentRequest = z.infer<typeof updateDocumentRequestSchema>;
export type SaveDocumentContentRequest = z.infer<typeof saveDocumentContentSchema>;
export type DocumentListParams = z.infer<typeof documentListParamsSchema>;
export type KnowledgeBaseDocumentListParams = z.infer<typeof knowledgeBaseDocumentListParamsSchema>;
export type TrashListParams = z.infer<typeof trashListParamsSchema>;
