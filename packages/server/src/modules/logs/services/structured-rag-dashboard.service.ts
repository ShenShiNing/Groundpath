import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@shared/db';
import { systemLogs } from '@shared/db/schema/system/system-logs.schema';
import { structuredRagObservabilityConfig } from '@config/env';
import type {
  StructuredRagDashboardAlert,
  StructuredRagDashboardKnowledgeBaseBreakdown,
  StructuredRagDashboardSummary,
  StructuredRagDashboardTrendPoint,
} from '@knowledge-agent/shared/types';

export interface StructuredRagDashboardParams {
  userId?: string;
  hours: number;
  recentLimit: number;
  knowledgeBaseId?: string;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return round((part / total) * 100);
}

function numeric(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  return 0;
}

function buildKnowledgeBaseFilter(knowledgeBaseId?: string) {
  if (!knowledgeBaseId) return sql``;

  return sql`AND JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.knowledgeBaseId')) = ${knowledgeBaseId}`;
}

function buildTrendLabels(bucketStart: Date, bucketEnd: Date, bucketHours: number): string {
  if (bucketHours >= 24) {
    return bucketStart.toLocaleDateString();
  }

  return `${bucketStart.getHours().toString().padStart(2, '0')}:00-${bucketEnd
    .getHours()
    .toString()
    .padStart(2, '0')}:00`;
}

function buildAlerts(
  summary: Pick<StructuredRagDashboardSummary, 'agent' | 'index'>
): StructuredRagDashboardAlert[] {
  const alerts: StructuredRagDashboardAlert[] = [];
  const thresholds = structuredRagObservabilityConfig.thresholds;

  if (summary.agent.fallbackRatio >= thresholds.fallbackRatio) {
    alerts.push({
      code: 'fallback_ratio',
      severity: summary.agent.fallbackRatio >= thresholds.fallbackRatio * 1.5 ? 'error' : 'warn',
      title: 'Fallback ratio elevated',
      description: 'Vector fallback is being used more often than expected.',
      value: summary.agent.fallbackRatio,
      threshold: thresholds.fallbackRatio,
    });
  }

  if (summary.agent.budgetExhaustionRate >= thresholds.budgetExhaustionRate) {
    alerts.push({
      code: 'budget_exhaustion',
      severity:
        summary.agent.budgetExhaustionRate >= thresholds.budgetExhaustionRate * 2
          ? 'error'
          : 'warn',
      title: 'Budget exhaustion elevated',
      description: 'Structured tool budgets are terminating a noticeable share of requests.',
      value: summary.agent.budgetExhaustionRate,
      threshold: thresholds.budgetExhaustionRate,
    });
  }

  if (summary.agent.providerErrorRate >= thresholds.providerErrorRate) {
    alerts.push({
      code: 'provider_error',
      severity:
        summary.agent.providerErrorRate >= thresholds.providerErrorRate * 2.5 ? 'error' : 'warn',
      title: 'Provider error rate elevated',
      description: 'Model provider failures are above the expected baseline.',
      value: summary.agent.providerErrorRate,
      threshold: thresholds.providerErrorRate,
    });
  }

  if (summary.index.avgFreshnessLagMs >= thresholds.freshnessLagMs) {
    alerts.push({
      code: 'freshness_lag',
      severity: summary.index.avgFreshnessLagMs >= thresholds.freshnessLagMs * 3 ? 'error' : 'warn',
      title: 'Index freshness lag elevated',
      description: 'New document versions are taking longer than expected to become queryable.',
      value: summary.index.avgFreshnessLagMs,
      threshold: thresholds.freshnessLagMs,
    });
  }

  return alerts;
}

function getTrendConfig(hours: number): {
  granularity: 'hour' | 'day';
  bucketCount: number;
  bucketSizeHours: number;
} {
  if (hours <= 24) {
    const bucketCount = Math.min(6, Math.max(hours, 1));
    return {
      granularity: 'hour',
      bucketCount,
      bucketSizeHours: Math.max(1, Math.ceil(hours / bucketCount)),
    };
  }

  const dayWindow = Math.ceil(hours / 24);
  const bucketCount = Math.min(14, Math.max(dayWindow, 1));
  return {
    granularity: 'day',
    bucketCount,
    bucketSizeHours: Math.max(24, Math.ceil(dayWindow / bucketCount) * 24),
  };
}

export const structuredRagDashboardService = {
  async getSummary(params: StructuredRagDashboardParams): Promise<StructuredRagDashboardSummary> {
    const since = new Date(Date.now() - params.hours * 60 * 60 * 1000);
    const knowledgeBaseFilter = buildKnowledgeBaseFilter(params.knowledgeBaseId);
    const userFilter = params.userId
      ? sql`AND JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.userId')) = ${params.userId}`
      : sql``;

    const [agentRows, indexRows, graphRows, recentEvents, agentBreakdownRows, indexBreakdownRows] =
      await Promise.all([
        db.execute(sql`
        SELECT
          COUNT(*) AS totalExecutions,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.usedFallback')) = 'true' THEN 1 ELSE 0 END), 0) AS fallbackCount,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.stopReason')) = 'budget_exhausted' THEN 1 ELSE 0 END), 0) AS budgetExhaustedCount,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.stopReason')) = 'tool_timeout' THEN 1 ELSE 0 END), 0) AS toolTimeoutCount,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.stopReason')) = 'provider_error' THEN 1 ELSE 0 END), 0) AS providerErrorCount,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.stopReason')) = 'insufficient_evidence' THEN 1 ELSE 0 END), 0) AS insufficientEvidenceCount,
          COALESCE(AVG(${systemLogs.durationMs}), 0) AS avgDurationMs,
          COALESCE(AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.finalCitationCount')) AS DECIMAL(12, 2))), 0) AS avgFinalCitationCount,
          COALESCE(AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.retrievedCitationCount')) AS DECIMAL(12, 2))), 0) AS avgRetrievedCitationCount
        FROM ${systemLogs}
        WHERE ${systemLogs.event} = 'structured_rag.agent_execution'
          AND ${systemLogs.createdAt} >= ${since}
          ${userFilter}
          ${knowledgeBaseFilter}
      `),
        db.execute(sql`
        SELECT
          COUNT(*) AS totalBuilds,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.success')) = 'true' THEN 1 ELSE 0 END), 0) AS successCount,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.structuredRequested')) = 'true' THEN 1 ELSE 0 END), 0) AS structuredRequestedCount,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.structuredParsed')) = 'true' THEN 1 ELSE 0 END), 0) AS structuredParsedCount,
          COALESCE(AVG(${systemLogs.durationMs}), 0) AS avgParseDurationMs,
          COALESCE(AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.indexFreshnessLagMs')) AS DECIMAL(16, 2))), 0) AS avgFreshnessLagMs
        FROM ${systemLogs}
        WHERE ${systemLogs.event} = 'structured_rag.index_build'
          AND ${systemLogs.createdAt} >= ${since}
          ${userFilter}
          ${knowledgeBaseFilter}
      `),
        db.execute(sql`
        SELECT
          COUNT(*) AS graphBuilds,
          COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.nodeCount')) AS UNSIGNED)), 0) AS totalNodes,
          COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.edgeCount')) AS UNSIGNED)), 0) AS totalEdges
        FROM ${systemLogs}
        WHERE ${systemLogs.event} = 'structured_rag.index_graph'
          AND ${systemLogs.createdAt} >= ${since}
          ${userFilter}
          ${knowledgeBaseFilter}
      `),
        db
          .select({
            id: systemLogs.id,
            event: systemLogs.event,
            message: systemLogs.message,
            createdAt: systemLogs.createdAt,
            durationMs: systemLogs.durationMs,
            metadata: systemLogs.metadata,
          })
          .from(systemLogs)
          .where(
            and(
              eq(systemLogs.category, 'performance'),
              gte(systemLogs.createdAt, since),
              params.userId
                ? sql`JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.userId')) = ${params.userId}`
                : undefined,
              params.knowledgeBaseId
                ? sql`JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.knowledgeBaseId')) = ${params.knowledgeBaseId}`
                : undefined,
              sql`${systemLogs.event} IN ('structured_rag.agent_execution', 'structured_rag.chat_completion', 'structured_rag.index_build', 'structured_rag.index_graph')`
            )
          )
          .orderBy(desc(systemLogs.createdAt))
          .limit(params.recentLimit),
        db.execute(sql`
        SELECT
          JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.knowledgeBaseId')) AS knowledgeBaseId,
          COUNT(*) AS totalExecutions,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.usedFallback')) = 'true' THEN 1 ELSE 0 END), 0) AS fallbackCount,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.stopReason')) = 'provider_error' THEN 1 ELSE 0 END), 0) AS providerErrorCount
        FROM ${systemLogs}
        WHERE ${systemLogs.event} = 'structured_rag.agent_execution'
          AND ${systemLogs.createdAt} >= ${since}
          ${userFilter}
          AND JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.knowledgeBaseId')) IS NOT NULL
          ${knowledgeBaseFilter}
        GROUP BY JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.knowledgeBaseId'))
      `),
        db.execute(sql`
        SELECT
          JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.knowledgeBaseId')) AS knowledgeBaseId,
          COUNT(*) AS totalBuilds,
          COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.structuredParsed')) = 'true' THEN 1 ELSE 0 END), 0) AS structuredParsedCount,
          COALESCE(AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.indexFreshnessLagMs')) AS DECIMAL(16, 2))), 0) AS avgFreshnessLagMs
        FROM ${systemLogs}
        WHERE ${systemLogs.event} = 'structured_rag.index_build'
          AND ${systemLogs.createdAt} >= ${since}
          ${userFilter}
          AND JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.knowledgeBaseId')) IS NOT NULL
          ${knowledgeBaseFilter}
        GROUP BY JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.knowledgeBaseId'))
      `),
      ]);

    const agent = ((agentRows as unknown as [Array<Record<string, unknown>>])[0] ?? [])[0] ?? {};
    const index = ((indexRows as unknown as [Array<Record<string, unknown>>])[0] ?? [])[0] ?? {};
    const graph = ((graphRows as unknown as [Array<Record<string, unknown>>])[0] ?? [])[0] ?? {};

    const totalExecutions = numeric(agent.totalExecutions);
    const totalBuilds = numeric(index.totalBuilds);
    const trendConfig = getTrendConfig(params.hours);
    const summary: StructuredRagDashboardSummary = {
      windowHours: params.hours,
      trendGranularity: trendConfig.granularity,
      filters: {
        knowledgeBaseId: params.knowledgeBaseId ?? null,
      },
      agent: {
        totalExecutions,
        fallbackRatio: percentage(numeric(agent.fallbackCount), totalExecutions),
        budgetExhaustionRate: percentage(numeric(agent.budgetExhaustedCount), totalExecutions),
        toolTimeoutRate: percentage(numeric(agent.toolTimeoutCount), totalExecutions),
        providerErrorRate: percentage(numeric(agent.providerErrorCount), totalExecutions),
        insufficientEvidenceRate: percentage(
          numeric(agent.insufficientEvidenceCount),
          totalExecutions
        ),
        avgDurationMs: round(numeric(agent.avgDurationMs)),
        avgFinalCitationCount: round(numeric(agent.avgFinalCitationCount)),
        avgRetrievedCitationCount: round(numeric(agent.avgRetrievedCitationCount)),
      },
      index: {
        totalBuilds,
        parseSuccessRate: percentage(numeric(index.successCount), totalBuilds),
        structuredRequestRate: percentage(numeric(index.structuredRequestedCount), totalBuilds),
        structuredCoverage: percentage(numeric(index.structuredParsedCount), totalBuilds),
        avgParseDurationMs: round(numeric(index.avgParseDurationMs)),
        avgFreshnessLagMs: round(numeric(index.avgFreshnessLagMs)),
        graphBuilds: numeric(graph.graphBuilds),
        totalNodes: numeric(graph.totalNodes),
        totalEdges: numeric(graph.totalEdges),
      },
      alerts: [],
      trend: [],
      knowledgeBaseBreakdown: [],
      recentEvents: recentEvents.map((event) => ({
        id: event.id,
        event: event.event,
        message: event.message,
        createdAt: event.createdAt,
        durationMs: event.durationMs,
        metadata:
          event.metadata && typeof event.metadata === 'object'
            ? (event.metadata as Record<string, unknown>)
            : null,
      })),
    };

    const bucketCount = trendConfig.bucketCount;
    const bucketHours = trendConfig.bucketSizeHours;
    const trend: StructuredRagDashboardTrendPoint[] = [];
    const windowStartMs = Date.now() - params.hours * 60 * 60 * 1000;
    const bucketMs = bucketHours * 60 * 60 * 1000;

    for (let idx = 0; idx < bucketCount; idx++) {
      const bucketStart = new Date(windowStartMs + idx * bucketMs);
      const bucketEnd =
        idx === bucketCount - 1 ? new Date() : new Date(windowStartMs + (idx + 1) * bucketMs);

      const [bucketAgentRows, bucketIndexRows] = await Promise.all([
        db.execute(sql`
          SELECT
            COUNT(*) AS totalExecutions,
            COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.usedFallback')) = 'true' THEN 1 ELSE 0 END), 0) AS fallbackCount
          FROM ${systemLogs}
          WHERE ${systemLogs.event} = 'structured_rag.agent_execution'
            AND ${systemLogs.createdAt} >= ${bucketStart}
            AND ${systemLogs.createdAt} < ${bucketEnd}
            ${userFilter}
            ${knowledgeBaseFilter}
        `),
        db.execute(sql`
          SELECT
            COUNT(*) AS totalBuilds,
            COALESCE(SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(${systemLogs.metadata}, '$.structuredParsed')) = 'true' THEN 1 ELSE 0 END), 0) AS structuredParsedCount
          FROM ${systemLogs}
          WHERE ${systemLogs.event} = 'structured_rag.index_build'
            AND ${systemLogs.createdAt} >= ${bucketStart}
            AND ${systemLogs.createdAt} < ${bucketEnd}
            ${userFilter}
            ${knowledgeBaseFilter}
        `),
      ]);

      const bucketAgent =
        ((bucketAgentRows as unknown as [Array<Record<string, unknown>>])[0] ?? [])[0] ?? {};
      const bucketIndex =
        ((bucketIndexRows as unknown as [Array<Record<string, unknown>>])[0] ?? [])[0] ?? {};
      const bucketExecutions = numeric(bucketAgent.totalExecutions);
      const bucketBuilds = numeric(bucketIndex.totalBuilds);

      trend.push({
        label: buildTrendLabels(bucketStart, bucketEnd, bucketHours),
        bucketStart,
        bucketEnd,
        agentExecutions: bucketExecutions,
        fallbackRatio: percentage(numeric(bucketAgent.fallbackCount), bucketExecutions),
        structuredCoverage: percentage(numeric(bucketIndex.structuredParsedCount), bucketBuilds),
        indexBuilds: bucketBuilds,
      });
    }

    const agentBreakdown = ((
      agentBreakdownRows as unknown as [Array<Record<string, unknown>>]
    )[0] ?? []) as Array<Record<string, unknown>>;
    const indexBreakdown = ((
      indexBreakdownRows as unknown as [Array<Record<string, unknown>>]
    )[0] ?? []) as Array<Record<string, unknown>>;
    const breakdownByKb = new Map<string, StructuredRagDashboardKnowledgeBaseBreakdown>();

    for (const row of agentBreakdown) {
      const knowledgeBaseId = String(row.knowledgeBaseId ?? '');
      if (!knowledgeBaseId) continue;
      const agentExecutions = numeric(row.totalExecutions);
      breakdownByKb.set(knowledgeBaseId, {
        knowledgeBaseId,
        agentExecutions,
        fallbackRatio: percentage(numeric(row.fallbackCount), agentExecutions),
        providerErrorRate: percentage(numeric(row.providerErrorCount), agentExecutions),
        structuredCoverage: 0,
        avgFreshnessLagMs: 0,
      });
    }

    for (const row of indexBreakdown) {
      const knowledgeBaseId = String(row.knowledgeBaseId ?? '');
      if (!knowledgeBaseId) continue;
      const current = breakdownByKb.get(knowledgeBaseId) ?? {
        knowledgeBaseId,
        agentExecutions: 0,
        fallbackRatio: 0,
        providerErrorRate: 0,
        structuredCoverage: 0,
        avgFreshnessLagMs: 0,
      };
      const totalBuildsForKb = numeric(row.totalBuilds);
      current.structuredCoverage = percentage(numeric(row.structuredParsedCount), totalBuildsForKb);
      current.avgFreshnessLagMs = round(numeric(row.avgFreshnessLagMs));
      breakdownByKb.set(knowledgeBaseId, current);
    }

    summary.trend = trend;
    summary.alerts = buildAlerts(summary);
    summary.knowledgeBaseBreakdown = [...breakdownByKb.values()]
      .sort((a, b) => b.agentExecutions - a.agentExecutions)
      .slice(0, 8);

    return summary;
  },
};
