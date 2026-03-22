import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { db } from '@core/db';
import { getDbContext, type Transaction } from '@core/db/db.utils';
import {
  structuredRagMetricRollups,
  type StructuredRagMetricEventType,
} from '@core/db/schema/system/structured-rag-metric-rollups.schema';

export interface StructuredRagMetricWindowFilters {
  since: Date;
  userId?: string;
  knowledgeBaseId?: string;
}

export interface StructuredRagMetricSummaryRow {
  eventType: StructuredRagMetricEventType;
  totalCount: number;
  fallbackCount: number;
  budgetExhaustedCount: number;
  toolTimeoutCount: number;
  providerErrorCount: number;
  insufficientEvidenceCount: number;
  totalDurationMs: number;
  totalFinalCitationCount: number;
  totalRetrievedCitationCount: number;
  successCount: number;
  structuredRequestedCount: number;
  structuredParsedCount: number;
  totalFreshnessLagMs: number;
  totalNodes: number;
  totalEdges: number;
}

export interface StructuredRagMetricBucketRow extends StructuredRagMetricSummaryRow {
  bucketStart: Date;
}

export interface StructuredRagMetricKnowledgeBaseRow extends StructuredRagMetricSummaryRow {
  knowledgeBaseId: string;
}

export type StructuredRagMetricRollupInput =
  | {
      eventType: 'agent_execution';
      createdAt: Date;
      userId: string;
      knowledgeBaseId?: string | null;
      totalCount: number;
      fallbackCount: number;
      budgetExhaustedCount: number;
      toolTimeoutCount: number;
      providerErrorCount: number;
      insufficientEvidenceCount: number;
      totalDurationMs: number;
      totalFinalCitationCount: number;
      totalRetrievedCitationCount: number;
    }
  | {
      eventType: 'index_build';
      createdAt: Date;
      userId: string;
      knowledgeBaseId: string;
      totalCount: number;
      successCount: number;
      structuredRequestedCount: number;
      structuredParsedCount: number;
      totalDurationMs: number;
      totalFreshnessLagMs: number;
    }
  | {
      eventType: 'index_graph';
      createdAt: Date;
      userId: string;
      knowledgeBaseId: string;
      totalCount: number;
      totalNodes: number;
      totalEdges: number;
    };

function normalizeDimension(value?: string | null): string {
  return value ?? '';
}

function buildRollupId(input: StructuredRagMetricRollupInput, bucketStart: Date): string {
  return [
    bucketStart.toISOString(),
    input.eventType,
    normalizeDimension(input.userId),
    normalizeDimension(input.knowledgeBaseId),
  ].join('|');
}

function buildWhere(
  filters: StructuredRagMetricWindowFilters,
  excludeEmptyKnowledgeBase: boolean = false
) {
  const conditions = [gte(structuredRagMetricRollups.bucketStart, filters.since)];

  if (filters.userId) {
    conditions.push(eq(structuredRagMetricRollups.userId, filters.userId));
  }

  if (filters.knowledgeBaseId) {
    conditions.push(eq(structuredRagMetricRollups.knowledgeBaseId, filters.knowledgeBaseId));
  }

  if (excludeEmptyKnowledgeBase) {
    conditions.push(ne(structuredRagMetricRollups.knowledgeBaseId, ''));
  }

  return conditions.length === 1 ? conditions[0]! : and(...conditions);
}

function sumSelection() {
  return {
    totalCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.totalCount}), 0)`,
    fallbackCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.fallbackCount}), 0)`,
    budgetExhaustedCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.budgetExhaustedCount}), 0)`,
    toolTimeoutCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.toolTimeoutCount}), 0)`,
    providerErrorCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.providerErrorCount}), 0)`,
    insufficientEvidenceCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.insufficientEvidenceCount}), 0)`,
    totalDurationMs: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.totalDurationMs}), 0)`,
    totalFinalCitationCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.totalFinalCitationCount}), 0)`,
    totalRetrievedCitationCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.totalRetrievedCitationCount}), 0)`,
    successCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.successCount}), 0)`,
    structuredRequestedCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.structuredRequestedCount}), 0)`,
    structuredParsedCount: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.structuredParsedCount}), 0)`,
    totalFreshnessLagMs: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.totalFreshnessLagMs}), 0)`,
    totalNodes: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.totalNodes}), 0)`,
    totalEdges: sql<number>`COALESCE(SUM(${structuredRagMetricRollups.totalEdges}), 0)`,
  };
}

export const structuredRagMetricRollupRepository = {
  async upsert(
    input: StructuredRagMetricRollupInput,
    bucketStart: Date,
    tx?: Transaction
  ): Promise<void> {
    const ctx = getDbContext(tx);
    const id = buildRollupId(input, bucketStart);

    const baseRow = {
      id,
      bucketStart,
      eventType: input.eventType,
      userId: normalizeDimension(input.userId),
      knowledgeBaseId: normalizeDimension(input.knowledgeBaseId),
      totalCount: input.totalCount,
      fallbackCount: input.eventType === 'agent_execution' ? input.fallbackCount : 0,
      budgetExhaustedCount: input.eventType === 'agent_execution' ? input.budgetExhaustedCount : 0,
      toolTimeoutCount: input.eventType === 'agent_execution' ? input.toolTimeoutCount : 0,
      providerErrorCount: input.eventType === 'agent_execution' ? input.providerErrorCount : 0,
      insufficientEvidenceCount:
        input.eventType === 'agent_execution' ? input.insufficientEvidenceCount : 0,
      totalDurationMs:
        input.eventType === 'index_graph' ? 0 : Math.max(0, Math.round(input.totalDurationMs)),
      totalFinalCitationCount:
        input.eventType === 'agent_execution' ? input.totalFinalCitationCount : 0,
      totalRetrievedCitationCount:
        input.eventType === 'agent_execution' ? input.totalRetrievedCitationCount : 0,
      successCount: input.eventType === 'index_build' ? input.successCount : 0,
      structuredRequestedCount:
        input.eventType === 'index_build' ? input.structuredRequestedCount : 0,
      structuredParsedCount: input.eventType === 'index_build' ? input.structuredParsedCount : 0,
      totalFreshnessLagMs:
        input.eventType === 'index_build' ? Math.max(0, Math.round(input.totalFreshnessLagMs)) : 0,
      totalNodes: input.eventType === 'index_graph' ? input.totalNodes : 0,
      totalEdges: input.eventType === 'index_graph' ? input.totalEdges : 0,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };

    await ctx
      .insert(structuredRagMetricRollups)
      .values(baseRow)
      .onDuplicateKeyUpdate({
        set: {
          totalCount: sql`${structuredRagMetricRollups.totalCount} + ${baseRow.totalCount}`,
          fallbackCount: sql`${structuredRagMetricRollups.fallbackCount} + ${baseRow.fallbackCount}`,
          budgetExhaustedCount: sql`${structuredRagMetricRollups.budgetExhaustedCount} + ${baseRow.budgetExhaustedCount}`,
          toolTimeoutCount: sql`${structuredRagMetricRollups.toolTimeoutCount} + ${baseRow.toolTimeoutCount}`,
          providerErrorCount: sql`${structuredRagMetricRollups.providerErrorCount} + ${baseRow.providerErrorCount}`,
          insufficientEvidenceCount: sql`${structuredRagMetricRollups.insufficientEvidenceCount} + ${baseRow.insufficientEvidenceCount}`,
          totalDurationMs: sql`${structuredRagMetricRollups.totalDurationMs} + ${baseRow.totalDurationMs}`,
          totalFinalCitationCount: sql`${structuredRagMetricRollups.totalFinalCitationCount} + ${baseRow.totalFinalCitationCount}`,
          totalRetrievedCitationCount: sql`${structuredRagMetricRollups.totalRetrievedCitationCount} + ${baseRow.totalRetrievedCitationCount}`,
          successCount: sql`${structuredRagMetricRollups.successCount} + ${baseRow.successCount}`,
          structuredRequestedCount: sql`${structuredRagMetricRollups.structuredRequestedCount} + ${baseRow.structuredRequestedCount}`,
          structuredParsedCount: sql`${structuredRagMetricRollups.structuredParsedCount} + ${baseRow.structuredParsedCount}`,
          totalFreshnessLagMs: sql`${structuredRagMetricRollups.totalFreshnessLagMs} + ${baseRow.totalFreshnessLagMs}`,
          totalNodes: sql`${structuredRagMetricRollups.totalNodes} + ${baseRow.totalNodes}`,
          totalEdges: sql`${structuredRagMetricRollups.totalEdges} + ${baseRow.totalEdges}`,
          updatedAt: input.createdAt,
        },
      });
  },

  async getSummaryRows(
    filters: StructuredRagMetricWindowFilters
  ): Promise<StructuredRagMetricSummaryRow[]> {
    return db
      .select({
        eventType: structuredRagMetricRollups.eventType,
        ...sumSelection(),
      })
      .from(structuredRagMetricRollups)
      .where(buildWhere(filters))
      .groupBy(structuredRagMetricRollups.eventType);
  },

  async getBucketRows(
    filters: StructuredRagMetricWindowFilters
  ): Promise<StructuredRagMetricBucketRow[]> {
    return db
      .select({
        bucketStart: structuredRagMetricRollups.bucketStart,
        eventType: structuredRagMetricRollups.eventType,
        ...sumSelection(),
      })
      .from(structuredRagMetricRollups)
      .where(buildWhere(filters))
      .groupBy(structuredRagMetricRollups.bucketStart, structuredRagMetricRollups.eventType)
      .orderBy(structuredRagMetricRollups.bucketStart);
  },

  async getKnowledgeBaseRows(
    filters: StructuredRagMetricWindowFilters
  ): Promise<StructuredRagMetricKnowledgeBaseRow[]> {
    return db
      .select({
        knowledgeBaseId: structuredRagMetricRollups.knowledgeBaseId,
        eventType: structuredRagMetricRollups.eventType,
        ...sumSelection(),
      })
      .from(structuredRagMetricRollups)
      .where(buildWhere(filters, true))
      .groupBy(structuredRagMetricRollups.knowledgeBaseId, structuredRagMetricRollups.eventType);
  },
};
