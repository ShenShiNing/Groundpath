/**
 * Document AI Schemas
 * Zod validation schemas for document AI features
 */

import { z } from 'zod';

// ============================================================================
// Summary Schemas
// ============================================================================

export const summaryLengthSchema = z.enum(['short', 'medium', 'detailed']);

export const summaryRequestSchema = z.object({
  length: summaryLengthSchema.optional().default('medium'),
  language: z.string().optional(),
  focusAreas: z.array(z.string()).optional(),
});

// ============================================================================
// Analysis Schemas
// ============================================================================

export const analysisTypeSchema = z.enum(['keywords', 'entities', 'topics', 'structure']);

export const analysisRequestSchema = z.object({
  analysisTypes: z.array(analysisTypeSchema).optional().default(['keywords', 'structure']),
  maxKeywords: z.number().int().min(1).max(50).optional().default(10),
  maxEntities: z.number().int().min(1).max(100).optional().default(20),
  maxTopics: z.number().int().min(1).max(20).optional().default(5),
});

// ============================================================================
// Generation Schemas
// ============================================================================

export const generationTemplateSchema = z.enum([
  'report',
  'email',
  'article',
  'outline',
  'summary',
  'custom',
]);

export const generationStyleSchema = z.enum([
  'formal',
  'casual',
  'technical',
  'creative',
  'academic',
]);

export const generateRequestSchema = z.object({
  prompt: z.string().min(1).max(10000),
  template: generationTemplateSchema.optional(),
  style: generationStyleSchema.optional().default('formal'),
  language: z.string().optional(),
  maxLength: z.number().int().min(100).max(50000).optional(),
  knowledgeBaseId: z.string().uuid().optional(),
  contextDocumentIds: z.array(z.string().uuid()).optional(),
});

export const expandRequestSchema = z.object({
  instruction: z.string().min(1).max(5000),
  position: z.enum(['before', 'after', 'replace']).optional().default('after'),
  style: generationStyleSchema.optional(),
  maxLength: z.number().int().min(100).max(50000).optional(),
  knowledgeBaseId: z.string().uuid().optional(),
});

// ============================================================================
// Inferred Types
// ============================================================================

export type SummaryRequestInput = z.input<typeof summaryRequestSchema>;
export type SummaryRequestParsed = z.output<typeof summaryRequestSchema>;

export type AnalysisRequestInput = z.input<typeof analysisRequestSchema>;
export type AnalysisRequestParsed = z.output<typeof analysisRequestSchema>;

export type GenerateRequestInput = z.input<typeof generateRequestSchema>;
export type GenerateRequestParsed = z.output<typeof generateRequestSchema>;

export type ExpandRequestInput = z.input<typeof expandRequestSchema>;
export type ExpandRequestParsed = z.output<typeof expandRequestSchema>;
