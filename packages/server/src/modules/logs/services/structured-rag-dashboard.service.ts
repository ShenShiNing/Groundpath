import { structuredRagObservabilityConfig } from '@config/env';
import type {
  StructuredRagDashboardAlert,
  StructuredRagDashboardKnowledgeBaseBreakdown,
  StructuredRagDashboardSummary,
  StructuredRagDashboardTrendPoint,
} from '@groundpath/shared/types';
import type { StructuredRagMetricEventType } from '@core/db/schema/system/structured-rag-metric-rollups.schema';
import {
  structuredRagMetricRollupRepository,
  type StructuredRagMetricBucketRow,
  type StructuredRagMetricKnowledgeBaseRow,
  type StructuredRagMetricSummaryRow,
} from '../repositories/structured-rag-metric-rollup.repository';
import { systemLogRepository } from '../repositories/system-log.repository';

export interface StructuredRagDashboardParams {
  userId?: string;
  hours: number;
  recentLimit: number;
  knowledgeBaseId?: string;
}

interface TrendAccumulator {
  agentExecutions: number;
  fallbackCount: number;
  indexBuilds: number;
  structuredParsedCount: number;
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

function floorToRollupBucket(date: Date): Date {
  const bucket = new Date(date);
  const bucketMinutes = structuredRagObservabilityConfig.rollupBucketMinutes;

  bucket.setUTCSeconds(0, 0);
  bucket.setUTCMinutes(bucket.getUTCMinutes() - (bucket.getUTCMinutes() % bucketMinutes));

  return bucket;
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

function emptySummaryRow(eventType: StructuredRagMetricEventType): StructuredRagMetricSummaryRow {
  return {
    eventType,
    totalCount: 0,
    fallbackCount: 0,
    budgetExhaustedCount: 0,
    toolTimeoutCount: 0,
    providerErrorCount: 0,
    insufficientEvidenceCount: 0,
    totalDurationMs: 0,
    totalFinalCitationCount: 0,
    totalRetrievedCitationCount: 0,
    successCount: 0,
    structuredRequestedCount: 0,
    structuredParsedCount: 0,
    totalFreshnessLagMs: 0,
    totalNodes: 0,
    totalEdges: 0,
  };
}

function getSummaryRow(
  rows: StructuredRagMetricSummaryRow[],
  eventType: StructuredRagMetricEventType
): StructuredRagMetricSummaryRow {
  return rows.find((row) => row.eventType === eventType) ?? emptySummaryRow(eventType);
}

function findBucketIndex(
  bucketStartMs: number,
  windowStartMs: number,
  bucketMs: number,
  bucketCount: number
): number {
  const offset = bucketStartMs - windowStartMs;
  if (offset < 0) return -1;

  const index = Math.floor(offset / bucketMs);
  return index >= bucketCount ? bucketCount - 1 : index;
}

function applyTrendRow(acc: TrendAccumulator, row: StructuredRagMetricBucketRow): void {
  if (row.eventType === 'agent_execution') {
    acc.agentExecutions += numeric(row.totalCount);
    acc.fallbackCount += numeric(row.fallbackCount);
    return;
  }

  if (row.eventType === 'index_build') {
    acc.indexBuilds += numeric(row.totalCount);
    acc.structuredParsedCount += numeric(row.structuredParsedCount);
  }
}

function applyKnowledgeBaseRow(
  breakdownByKb: Map<string, StructuredRagDashboardKnowledgeBaseBreakdown>,
  row: StructuredRagMetricKnowledgeBaseRow
): void {
  const knowledgeBaseId = row.knowledgeBaseId;
  if (!knowledgeBaseId) return;

  const current = breakdownByKb.get(knowledgeBaseId) ?? {
    knowledgeBaseId,
    agentExecutions: 0,
    fallbackRatio: 0,
    providerErrorRate: 0,
    structuredCoverage: 0,
    avgFreshnessLagMs: 0,
  };

  if (row.eventType === 'agent_execution') {
    const agentExecutions = numeric(row.totalCount);
    current.agentExecutions = agentExecutions;
    current.fallbackRatio = percentage(numeric(row.fallbackCount), agentExecutions);
    current.providerErrorRate = percentage(numeric(row.providerErrorCount), agentExecutions);
  }

  if (row.eventType === 'index_build') {
    const totalBuilds = numeric(row.totalCount);
    current.structuredCoverage = percentage(numeric(row.structuredParsedCount), totalBuilds);
    current.avgFreshnessLagMs =
      totalBuilds > 0 ? round(numeric(row.totalFreshnessLagMs) / totalBuilds) : 0;
  }

  breakdownByKb.set(knowledgeBaseId, current);
}

export const structuredRagDashboardService = {
  async getSummary(params: StructuredRagDashboardParams): Promise<StructuredRagDashboardSummary> {
    const since = new Date(Date.now() - params.hours * 60 * 60 * 1000);
    const effectiveSince = floorToRollupBucket(since);
    const trendConfig = getTrendConfig(params.hours);

    const [summaryRows, trendRows, knowledgeBaseRows, recentEvents] = await Promise.all([
      structuredRagMetricRollupRepository.getSummaryRows({
        since: effectiveSince,
        userId: params.userId,
        knowledgeBaseId: params.knowledgeBaseId,
      }),
      structuredRagMetricRollupRepository.getBucketRows({
        since: effectiveSince,
        userId: params.userId,
        knowledgeBaseId: params.knowledgeBaseId,
      }),
      structuredRagMetricRollupRepository.getKnowledgeBaseRows({
        since: effectiveSince,
        userId: params.userId,
        knowledgeBaseId: params.knowledgeBaseId,
      }),
      systemLogRepository.listStructuredRagRecentEvents({
        since: effectiveSince,
        userId: params.userId,
        knowledgeBaseId: params.knowledgeBaseId,
        limit: params.recentLimit,
      }),
    ]);

    const agent = getSummaryRow(summaryRows, 'agent_execution');
    const index = getSummaryRow(summaryRows, 'index_build');
    const graph = getSummaryRow(summaryRows, 'index_graph');

    const totalExecutions = numeric(agent.totalCount);
    const totalBuilds = numeric(index.totalCount);

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
        avgDurationMs:
          totalExecutions > 0 ? round(numeric(agent.totalDurationMs) / totalExecutions) : 0,
        avgFinalCitationCount:
          totalExecutions > 0 ? round(numeric(agent.totalFinalCitationCount) / totalExecutions) : 0,
        avgRetrievedCitationCount:
          totalExecutions > 0
            ? round(numeric(agent.totalRetrievedCitationCount) / totalExecutions)
            : 0,
      },
      index: {
        totalBuilds,
        parseSuccessRate: percentage(numeric(index.successCount), totalBuilds),
        structuredRequestRate: percentage(numeric(index.structuredRequestedCount), totalBuilds),
        structuredCoverage: percentage(numeric(index.structuredParsedCount), totalBuilds),
        avgParseDurationMs:
          totalBuilds > 0 ? round(numeric(index.totalDurationMs) / totalBuilds) : 0,
        avgFreshnessLagMs:
          totalBuilds > 0 ? round(numeric(index.totalFreshnessLagMs) / totalBuilds) : 0,
        graphBuilds: numeric(graph.totalCount),
        totalNodes: numeric(graph.totalNodes),
        totalEdges: numeric(graph.totalEdges),
      },
      alerts: [],
      trend: [],
      knowledgeBaseBreakdown: [],
      recentEvents,
    };

    const bucketCount = trendConfig.bucketCount;
    const bucketHours = trendConfig.bucketSizeHours;
    const bucketMs = bucketHours * 60 * 60 * 1000;
    const windowStartMs = effectiveSince.getTime();
    const trendAccumulators: TrendAccumulator[] = Array.from({ length: bucketCount }, () => ({
      agentExecutions: 0,
      fallbackCount: 0,
      indexBuilds: 0,
      structuredParsedCount: 0,
    }));

    for (const row of trendRows) {
      const bucketIndex = findBucketIndex(
        row.bucketStart.getTime(),
        windowStartMs,
        bucketMs,
        bucketCount
      );

      if (bucketIndex < 0) continue;
      applyTrendRow(trendAccumulators[bucketIndex]!, row);
    }

    summary.trend = trendAccumulators.map((acc, idx) => {
      const bucketStart = new Date(windowStartMs + idx * bucketMs);
      const bucketEnd =
        idx === bucketCount - 1 ? new Date() : new Date(windowStartMs + (idx + 1) * bucketMs);

      return {
        label: buildTrendLabels(bucketStart, bucketEnd, bucketHours),
        bucketStart,
        bucketEnd,
        agentExecutions: acc.agentExecutions,
        fallbackRatio: percentage(acc.fallbackCount, acc.agentExecutions),
        structuredCoverage: percentage(acc.structuredParsedCount, acc.indexBuilds),
        indexBuilds: acc.indexBuilds,
      } satisfies StructuredRagDashboardTrendPoint;
    });

    const breakdownByKb = new Map<string, StructuredRagDashboardKnowledgeBaseBreakdown>();

    for (const row of knowledgeBaseRows) {
      applyKnowledgeBaseRow(breakdownByKb, row);
    }

    summary.alerts = buildAlerts(summary);
    summary.knowledgeBaseBreakdown = [...breakdownByKb.values()]
      .sort((a, b) => b.agentExecutions - a.agentExecutions)
      .slice(0, 8);

    return summary;
  },
};
