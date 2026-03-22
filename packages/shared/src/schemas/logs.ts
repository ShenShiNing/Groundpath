import { z } from 'zod';
import { AGENT_STOP_REASONS } from '../types/chat';

/**
 * Common pagination schema for log queries (internal)
 */
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Date range filter schema (internal)
 */
const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

/**
 * Login log query params
 */
export const loginLogQuerySchema = paginationSchema.extend(dateRangeSchema.shape).extend({
  success: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  authType: z.enum(['email', 'github', 'wechat', 'google', 'password']).optional(),
});

export type LoginLogQueryParams = z.infer<typeof loginLogQuerySchema>;

/**
 * Operation log query params
 */
export const operationLogQuerySchema = paginationSchema.extend(dateRangeSchema.shape).extend({
  resourceType: z.enum(['document', 'knowledge_base', 'user', 'session']).optional(),
  action: z
    .enum([
      'document.upload',
      'document.update',
      'document.delete',
      'document.restore',
      'document.permanent_delete',
      'document.download',
      'document.upload_version',
      'document.restore_version',
      'knowledge_base.create',
      'knowledge_base.update',
      'knowledge_base.delete',
      'user.change_password',
      'session.logout',
      'session.logout_all',
      'session.revoke',
    ])
    .optional(),
});

export type OperationLogQueryParams = z.infer<typeof operationLogQuerySchema>;

/**
 * Resource history params
 */
export const resourceHistorySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ResourceHistoryParams = z.infer<typeof resourceHistorySchema>;

/**
 * Structured RAG dashboard query params
 */
export const structuredRagDashboardQuerySchema = z.object({
  hours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .default(24),
  recentLimit: z.coerce.number().int().min(1).max(20).default(8),
  knowledgeBaseId: z.string().uuid().optional(),
});

export type StructuredRagDashboardQueryParams = z.infer<typeof structuredRagDashboardQuerySchema>;

export const structuredRagReportQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
  knowledgeBaseId: z.string().uuid().optional(),
});

export type StructuredRagReportQueryParams = z.infer<typeof structuredRagReportQuerySchema>;

const structuredRagRecentEventBaseSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
  createdAt: z.string().datetime(),
  durationMs: z.number().int().min(0).nullable(),
});

const structuredRagAgentExecutionMetadataSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  knowledgeBaseId: z.string().uuid().nullable(),
  provider: z.string().min(1),
  stopReason: z.enum(AGENT_STOP_REASONS).nullable(),
  toolCallCount: z.number().int().min(0),
  structuredToolCalls: z.number().int().min(0),
  fallbackToolCalls: z.number().int().min(0),
  externalToolCalls: z.number().int().min(0),
  usedFallback: z.boolean(),
  budgetExhausted: z.boolean(),
  toolTimedOut: z.boolean(),
  providerError: z.boolean(),
  insufficientEvidence: z.boolean(),
  agentTraceSteps: z.number().int().min(0),
  retrievedCitationCount: z.number().int().min(0),
  finalCitationCount: z.number().int().min(0),
});

const structuredRagChatCompletionMetadataSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  knowledgeBaseId: z.string().uuid().nullable(),
  provider: z.string().min(1),
  transport: z.enum(['streaming', 'non_streaming']),
  orchestration: z.enum(['agent', 'legacy']),
  stopReason: z.enum(AGENT_STOP_REASONS).nullable(),
  hasKnowledgeBase: z.boolean(),
  structuredToolsAvailable: z.boolean(),
  retrievedCitationCount: z.number().int().min(0),
  finalCitationCount: z.number().int().min(0),
});

const structuredRagIndexBuildMetadataSchema = z.object({
  documentId: z.string().uuid(),
  userId: z.string().uuid(),
  knowledgeBaseId: z.string().uuid(),
  documentVersion: z.number().int().min(1),
  routeMode: z.enum(['structured', 'chunked']),
  parseMethod: z.string().min(1),
  parserRuntime: z.string().min(1),
  headingCount: z.number().int().min(0),
  indexFreshnessLagMs: z.number().min(0).nullable().optional(),
  success: z.boolean(),
  structuredRequested: z.boolean(),
  structuredParsed: z.boolean(),
  fallbackToChunk: z.boolean(),
  reason: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

const structuredRagIndexGraphMetadataSchema = z.object({
  documentId: z.string().uuid(),
  userId: z.string().uuid(),
  knowledgeBaseId: z.string().uuid(),
  indexVersionId: z.string().uuid(),
  nodeCount: z.number().int().min(0),
  edgeCount: z.number().int().min(0),
});

export const structuredRagRecentEventSchema = z.union([
  structuredRagRecentEventBaseSchema.extend({
    event: z.literal('structured_rag.agent_execution'),
    metadata: structuredRagAgentExecutionMetadataSchema.nullable(),
  }),
  structuredRagRecentEventBaseSchema.extend({
    event: z.literal('structured_rag.chat_completion'),
    metadata: structuredRagChatCompletionMetadataSchema.nullable(),
  }),
  structuredRagRecentEventBaseSchema.extend({
    event: z.literal('structured_rag.index_build'),
    metadata: structuredRagIndexBuildMetadataSchema.nullable(),
  }),
  structuredRagRecentEventBaseSchema.extend({
    event: z.literal('structured_rag.index_graph'),
    metadata: structuredRagIndexGraphMetadataSchema.nullable(),
  }),
]);

export const structuredRagDashboardAlertSchema = z.object({
  code: z.enum(['fallback_ratio', 'budget_exhaustion', 'provider_error', 'freshness_lag']),
  severity: z.enum(['info', 'warn', 'error']),
  title: z.string(),
  description: z.string(),
  value: z.number(),
  threshold: z.number(),
});

export const structuredRagDashboardTrendPointSchema = z.object({
  label: z.string(),
  bucketStart: z.string().datetime(),
  bucketEnd: z.string().datetime(),
  agentExecutions: z.number().int().min(0),
  fallbackRatio: z.number(),
  structuredCoverage: z.number(),
  indexBuilds: z.number().int().min(0),
});

export const structuredRagDashboardKnowledgeBaseBreakdownSchema = z.object({
  knowledgeBaseId: z.string().uuid(),
  agentExecutions: z.number().int().min(0),
  fallbackRatio: z.number(),
  providerErrorRate: z.number(),
  structuredCoverage: z.number(),
  avgFreshnessLagMs: z.number().min(0),
});

export const structuredRagDashboardSummarySchema = z.object({
  windowHours: z.number().int().min(1),
  trendGranularity: z.enum(['hour', 'day']),
  filters: z.object({
    knowledgeBaseId: z.string().uuid().nullable(),
  }),
  agent: z.object({
    totalExecutions: z.number().int().min(0),
    fallbackRatio: z.number(),
    budgetExhaustionRate: z.number(),
    toolTimeoutRate: z.number(),
    providerErrorRate: z.number(),
    insufficientEvidenceRate: z.number(),
    avgDurationMs: z.number().min(0),
    avgFinalCitationCount: z.number().min(0),
    avgRetrievedCitationCount: z.number().min(0),
  }),
  index: z.object({
    totalBuilds: z.number().int().min(0),
    parseSuccessRate: z.number(),
    structuredRequestRate: z.number(),
    structuredCoverage: z.number(),
    avgParseDurationMs: z.number().min(0),
    avgFreshnessLagMs: z.number().min(0),
    graphBuilds: z.number().int().min(0),
    totalNodes: z.number().int().min(0),
    totalEdges: z.number().int().min(0),
  }),
  alerts: z.array(structuredRagDashboardAlertSchema),
  trend: z.array(structuredRagDashboardTrendPointSchema),
  knowledgeBaseBreakdown: z.array(structuredRagDashboardKnowledgeBaseBreakdownSchema),
  recentEvents: z.array(structuredRagRecentEventSchema),
});

export const structuredRagLongTermReportSchema = z.object({
  generatedAt: z.string().datetime(),
  windowDays: z.number().int().min(1),
  filters: z.object({
    knowledgeBaseId: z.string().uuid().nullable(),
    userScoped: z.boolean(),
  }),
  highlights: z.array(z.string()),
  summary: structuredRagDashboardSummarySchema,
  markdown: z.string(),
});
