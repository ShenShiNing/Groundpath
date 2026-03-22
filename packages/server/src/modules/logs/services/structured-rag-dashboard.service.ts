import { and, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { db } from '@core/db';
import { systemLogs } from '@core/db/schema/system/system-logs.schema';
import { structuredRagObservabilityConfig } from '@config/env';
import type {
  StructuredRagDashboardAlert,
  StructuredRagDashboardKnowledgeBaseBreakdown,
  StructuredRagDashboardSummary,
  StructuredRagDashboardTrendPoint,
} from '@groundpath/shared/types';

const AGENT_EVENT = 'structured_rag.agent_execution';
const CHAT_COMPLETION_EVENT = 'structured_rag.chat_completion';
const INDEX_BUILD_EVENT = 'structured_rag.index_build';
const INDEX_GRAPH_EVENT = 'structured_rag.index_graph';

const DASHBOARD_SUMMARY_EVENTS = [AGENT_EVENT, INDEX_BUILD_EVENT, INDEX_GRAPH_EVENT] as const;
const DASHBOARD_RECENT_EVENTS = [
  AGENT_EVENT,
  CHAT_COMPLETION_EVENT,
  INDEX_BUILD_EVENT,
  INDEX_GRAPH_EVENT,
] as const;
const DASHBOARD_BREAKDOWN_EVENTS = [AGENT_EVENT, INDEX_BUILD_EVENT] as const;
const DASHBOARD_TREND_EVENTS = [AGENT_EVENT, INDEX_BUILD_EVENT] as const;

type DashboardQueryResult = [Array<Record<string, unknown>>, unknown];

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
    const bucketSizeHours = Math.max(1, Math.ceil(hours / 6));
    return {
      granularity: 'hour',
      bucketCount: Math.max(1, Math.ceil(hours / bucketSizeHours)),
      bucketSizeHours,
    };
  }

  const dayWindow = Math.ceil(hours / 24);
  const bucketSizeHours = Math.max(24, Math.ceil(dayWindow / 14) * 24);

  return {
    granularity: 'day',
    bucketCount: Math.max(1, Math.ceil(hours / bucketSizeHours)),
    bucketSizeHours,
  };
}

function buildInList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  );
}

function buildDashboardWhereClause(
  params: StructuredRagDashboardParams,
  options: {
    events: readonly string[];
    since: Date;
    until?: Date;
    requireKnowledgeBaseId?: boolean;
  }
): SQL {
  const clauses: SQL[] = [
    sql`${systemLogs.event} IN (${buildInList(options.events)})`,
    sql`${systemLogs.createdAt} >= ${options.since}`,
  ];

  if (options.until) {
    clauses.push(sql`${systemLogs.createdAt} < ${options.until}`);
  }

  if (params.userId) {
    clauses.push(sql`${systemLogs.metadataUserId} = ${params.userId}`);
  }

  if (params.knowledgeBaseId) {
    clauses.push(sql`${systemLogs.metadataKnowledgeBaseId} = ${params.knowledgeBaseId}`);
  }

  if (options.requireKnowledgeBaseId) {
    clauses.push(sql`${systemLogs.metadataKnowledgeBaseId} IS NOT NULL`);
  }

  return sql.join(clauses, sql` AND `);
}

function extractRows(result: unknown): Array<Record<string, unknown>> {
  return ((result as DashboardQueryResult)[0] ?? []) as Array<Record<string, unknown>>;
}

export const structuredRagDashboardService = {
  async getSummary(params: StructuredRagDashboardParams): Promise<StructuredRagDashboardSummary> {
    const currentTime = new Date();
    const windowStart = new Date(currentTime.getTime() - params.hours * 60 * 60 * 1000);
    const trendConfig = getTrendConfig(params.hours);

    const summaryWhere = buildDashboardWhereClause(params, {
      events: DASHBOARD_SUMMARY_EVENTS,
      since: windowStart,
      until: currentTime,
    });
    const breakdownWhere = buildDashboardWhereClause(params, {
      events: DASHBOARD_BREAKDOWN_EVENTS,
      since: windowStart,
      until: currentTime,
      requireKnowledgeBaseId: true,
    });
    const trendWhere = buildDashboardWhereClause(params, {
      events: DASHBOARD_TREND_EVENTS,
      since: windowStart,
      until: currentTime,
    });

    const bucketSizeSeconds = trendConfig.bucketSizeHours * 60 * 60;
    const [summaryRows, recentEvents, breakdownRows, trendRows] = await Promise.all([
      db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} THEN 1 ELSE 0 END), 0) AS totalExecutions,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} AND ${systemLogs.metadataUsedFallback} THEN 1 ELSE 0 END), 0) AS fallbackCount,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} AND ${systemLogs.metadataStopReason} = ${'budget_exhausted'} THEN 1 ELSE 0 END), 0) AS budgetExhaustedCount,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} AND ${systemLogs.metadataStopReason} = ${'tool_timeout'} THEN 1 ELSE 0 END), 0) AS toolTimeoutCount,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} AND ${systemLogs.metadataStopReason} = ${'provider_error'} THEN 1 ELSE 0 END), 0) AS providerErrorCount,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} AND ${systemLogs.metadataStopReason} = ${'insufficient_evidence'} THEN 1 ELSE 0 END), 0) AS insufficientEvidenceCount,
          COALESCE(AVG(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} THEN ${systemLogs.durationMs} END), 0) AS avgDurationMs,
          COALESCE(AVG(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} THEN ${systemLogs.metadataFinalCitationCount} END), 0) AS avgFinalCitationCount,
          COALESCE(AVG(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} THEN ${systemLogs.metadataRetrievedCitationCount} END), 0) AS avgRetrievedCitationCount,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} THEN 1 ELSE 0 END), 0) AS totalBuilds,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} AND ${systemLogs.metadataSuccess} THEN 1 ELSE 0 END), 0) AS successCount,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} AND ${systemLogs.metadataStructuredRequested} THEN 1 ELSE 0 END), 0) AS structuredRequestedCount,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} AND ${systemLogs.metadataStructuredParsed} THEN 1 ELSE 0 END), 0) AS structuredParsedCount,
          COALESCE(AVG(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} THEN ${systemLogs.durationMs} END), 0) AS avgParseDurationMs,
          COALESCE(AVG(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} THEN ${systemLogs.metadataIndexFreshnessLagMs} END), 0) AS avgFreshnessLagMs,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_GRAPH_EVENT} THEN 1 ELSE 0 END), 0) AS graphBuilds,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_GRAPH_EVENT} THEN ${systemLogs.metadataNodeCount} ELSE 0 END), 0) AS totalNodes,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_GRAPH_EVENT} THEN ${systemLogs.metadataEdgeCount} ELSE 0 END), 0) AS totalEdges
        FROM ${systemLogs}
        WHERE ${summaryWhere}
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
            gte(systemLogs.createdAt, windowStart),
            lt(systemLogs.createdAt, currentTime),
            inArray(systemLogs.event, [...DASHBOARD_RECENT_EVENTS]),
            params.userId ? eq(systemLogs.metadataUserId, params.userId) : undefined,
            params.knowledgeBaseId
              ? eq(systemLogs.metadataKnowledgeBaseId, params.knowledgeBaseId)
              : undefined
          )
        )
        .orderBy(desc(systemLogs.createdAt))
        .limit(params.recentLimit),
      db.execute(sql`
        SELECT
          ${systemLogs.metadataKnowledgeBaseId} AS knowledgeBaseId,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} THEN 1 ELSE 0 END), 0) AS totalExecutions,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} AND ${systemLogs.metadataUsedFallback} THEN 1 ELSE 0 END), 0) AS fallbackCount,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} AND ${systemLogs.metadataStopReason} = ${'provider_error'} THEN 1 ELSE 0 END), 0) AS providerErrorCount,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} THEN 1 ELSE 0 END), 0) AS totalBuilds,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} AND ${systemLogs.metadataStructuredParsed} THEN 1 ELSE 0 END), 0) AS structuredParsedCount,
          COALESCE(AVG(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} THEN ${systemLogs.metadataIndexFreshnessLagMs} END), 0) AS avgFreshnessLagMs
        FROM ${systemLogs}
        WHERE ${breakdownWhere}
        GROUP BY ${systemLogs.metadataKnowledgeBaseId}
      `),
      db.execute(sql`
        SELECT
          FLOOR(TIMESTAMPDIFF(SECOND, ${windowStart}, ${systemLogs.createdAt}) / ${bucketSizeSeconds}) AS bucketIndex,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} THEN 1 ELSE 0 END), 0) AS totalExecutions,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${AGENT_EVENT} AND ${systemLogs.metadataUsedFallback} THEN 1 ELSE 0 END), 0) AS fallbackCount,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} THEN 1 ELSE 0 END), 0) AS totalBuilds,
          COALESCE(SUM(CASE WHEN ${systemLogs.event} = ${INDEX_BUILD_EVENT} AND ${systemLogs.metadataStructuredParsed} THEN 1 ELSE 0 END), 0) AS structuredParsedCount
        FROM ${systemLogs}
        WHERE ${trendWhere}
        GROUP BY bucketIndex
        ORDER BY bucketIndex ASC
      `),
    ]);

    const summaryAggregate = extractRows(summaryRows)[0] ?? {};
    const totalExecutions = numeric(summaryAggregate.totalExecutions);
    const totalBuilds = numeric(summaryAggregate.totalBuilds);

    const summary: StructuredRagDashboardSummary = {
      windowHours: params.hours,
      trendGranularity: trendConfig.granularity,
      filters: {
        knowledgeBaseId: params.knowledgeBaseId ?? null,
      },
      agent: {
        totalExecutions,
        fallbackRatio: percentage(numeric(summaryAggregate.fallbackCount), totalExecutions),
        budgetExhaustionRate: percentage(
          numeric(summaryAggregate.budgetExhaustedCount),
          totalExecutions
        ),
        toolTimeoutRate: percentage(numeric(summaryAggregate.toolTimeoutCount), totalExecutions),
        providerErrorRate: percentage(
          numeric(summaryAggregate.providerErrorCount),
          totalExecutions
        ),
        insufficientEvidenceRate: percentage(
          numeric(summaryAggregate.insufficientEvidenceCount),
          totalExecutions
        ),
        avgDurationMs: round(numeric(summaryAggregate.avgDurationMs)),
        avgFinalCitationCount: round(numeric(summaryAggregate.avgFinalCitationCount)),
        avgRetrievedCitationCount: round(numeric(summaryAggregate.avgRetrievedCitationCount)),
      },
      index: {
        totalBuilds,
        parseSuccessRate: percentage(numeric(summaryAggregate.successCount), totalBuilds),
        structuredRequestRate: percentage(
          numeric(summaryAggregate.structuredRequestedCount),
          totalBuilds
        ),
        structuredCoverage: percentage(
          numeric(summaryAggregate.structuredParsedCount),
          totalBuilds
        ),
        avgParseDurationMs: round(numeric(summaryAggregate.avgParseDurationMs)),
        avgFreshnessLagMs: round(numeric(summaryAggregate.avgFreshnessLagMs)),
        graphBuilds: numeric(summaryAggregate.graphBuilds),
        totalNodes: numeric(summaryAggregate.totalNodes),
        totalEdges: numeric(summaryAggregate.totalEdges),
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

    const bucketSizeMs = trendConfig.bucketSizeHours * 60 * 60 * 1000;
    const trendRowsByBucket = new Map<number, Record<string, unknown>>();

    for (const row of extractRows(trendRows)) {
      trendRowsByBucket.set(numeric(row.bucketIndex), row);
    }

    const trend: StructuredRagDashboardTrendPoint[] = Array.from(
      { length: trendConfig.bucketCount },
      (_, idx) => {
        const bucketStart = new Date(windowStart.getTime() + idx * bucketSizeMs);
        const bucketEnd = new Date(
          Math.min(windowStart.getTime() + (idx + 1) * bucketSizeMs, currentTime.getTime())
        );
        const bucketRow = trendRowsByBucket.get(idx) ?? {};
        const bucketExecutions = numeric(bucketRow.totalExecutions);
        const bucketBuilds = numeric(bucketRow.totalBuilds);

        return {
          label: buildTrendLabels(bucketStart, bucketEnd, trendConfig.bucketSizeHours),
          bucketStart,
          bucketEnd,
          agentExecutions: bucketExecutions,
          fallbackRatio: percentage(numeric(bucketRow.fallbackCount), bucketExecutions),
          structuredCoverage: percentage(numeric(bucketRow.structuredParsedCount), bucketBuilds),
          indexBuilds: bucketBuilds,
        };
      }
    );

    const knowledgeBaseBreakdown: StructuredRagDashboardKnowledgeBaseBreakdown[] = extractRows(
      breakdownRows
    )
      .map((row) => {
        const knowledgeBaseId = String(row.knowledgeBaseId ?? '');
        const agentExecutions = numeric(row.totalExecutions);
        const builds = numeric(row.totalBuilds);

        return {
          knowledgeBaseId,
          agentExecutions,
          fallbackRatio: percentage(numeric(row.fallbackCount), agentExecutions),
          providerErrorRate: percentage(numeric(row.providerErrorCount), agentExecutions),
          structuredCoverage: percentage(numeric(row.structuredParsedCount), builds),
          avgFreshnessLagMs: round(numeric(row.avgFreshnessLagMs)),
        };
      })
      .filter((row) => row.knowledgeBaseId)
      .sort((a, b) => b.agentExecutions - a.agentExecutions)
      .slice(0, 8);

    summary.trend = trend;
    summary.alerts = buildAlerts(summary);
    summary.knowledgeBaseBreakdown = knowledgeBaseBreakdown;

    return summary;
  },
};
