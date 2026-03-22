import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    structuredRagObservabilityConfig: {
      rollupBucketMinutes: 15,
      alertWindowHours: 24,
      alertCooldownHours: 6,
      alertReminderHours: 24,
      thresholds: {
        fallbackRatio: 35,
        budgetExhaustionRate: 10,
        providerErrorRate: 3,
        freshnessLagMs: 300000,
      },
      reportDefaultDays: 30,
    },
  },
  rollupRepository: {
    getSummaryRows: vi.fn(),
    getBucketRows: vi.fn(),
    getKnowledgeBaseRows: vi.fn(),
  },
  systemLogRepository: {
    listStructuredRagRecentEvents: vi.fn(),
  },
}));

vi.mock('@config/env', () => mocks.env);

vi.mock('@modules/logs/repositories/structured-rag-metric-rollup.repository', () => ({
  structuredRagMetricRollupRepository: mocks.rollupRepository,
}));

vi.mock('@modules/logs/repositories/system-log.repository', () => ({
  systemLogRepository: mocks.systemLogRepository,
}));

import { structuredRagDashboardService } from '@modules/logs/services/structured-rag-dashboard.service';

describe('structuredRagDashboardService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T10:23:00.000Z'));
    vi.clearAllMocks();

    mocks.rollupRepository.getSummaryRows.mockResolvedValue([
      {
        eventType: 'agent_execution',
        totalCount: 10,
        fallbackCount: 4,
        budgetExhaustedCount: 1,
        toolTimeoutCount: 0,
        providerErrorCount: 1,
        insufficientEvidenceCount: 2,
        totalDurationMs: 12000,
        totalFinalCitationCount: 15,
        totalRetrievedCitationCount: 25,
        successCount: 0,
        structuredRequestedCount: 0,
        structuredParsedCount: 0,
        totalFreshnessLagMs: 0,
        totalNodes: 0,
        totalEdges: 0,
      },
      {
        eventType: 'index_build',
        totalCount: 5,
        fallbackCount: 0,
        budgetExhaustedCount: 0,
        toolTimeoutCount: 0,
        providerErrorCount: 0,
        insufficientEvidenceCount: 0,
        totalDurationMs: 5000,
        totalFinalCitationCount: 0,
        totalRetrievedCitationCount: 0,
        successCount: 4,
        structuredRequestedCount: 5,
        structuredParsedCount: 3,
        totalFreshnessLagMs: 9000,
        totalNodes: 0,
        totalEdges: 0,
      },
      {
        eventType: 'index_graph',
        totalCount: 2,
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
        totalNodes: 20,
        totalEdges: 12,
      },
    ]);

    mocks.rollupRepository.getBucketRows.mockResolvedValue([
      {
        bucketStart: new Date('2026-03-22T04:15:00.000Z'),
        eventType: 'agent_execution',
        totalCount: 2,
        fallbackCount: 1,
        budgetExhaustedCount: 0,
        toolTimeoutCount: 0,
        providerErrorCount: 0,
        insufficientEvidenceCount: 0,
        totalDurationMs: 2000,
        totalFinalCitationCount: 0,
        totalRetrievedCitationCount: 0,
        successCount: 0,
        structuredRequestedCount: 0,
        structuredParsedCount: 0,
        totalFreshnessLagMs: 0,
        totalNodes: 0,
        totalEdges: 0,
      },
      {
        bucketStart: new Date('2026-03-22T05:15:00.000Z'),
        eventType: 'index_build',
        totalCount: 1,
        fallbackCount: 0,
        budgetExhaustedCount: 0,
        toolTimeoutCount: 0,
        providerErrorCount: 0,
        insufficientEvidenceCount: 0,
        totalDurationMs: 1000,
        totalFinalCitationCount: 0,
        totalRetrievedCitationCount: 0,
        successCount: 1,
        structuredRequestedCount: 1,
        structuredParsedCount: 1,
        totalFreshnessLagMs: 1000,
        totalNodes: 0,
        totalEdges: 0,
      },
    ]);

    mocks.rollupRepository.getKnowledgeBaseRows.mockResolvedValue([
      {
        knowledgeBaseId: 'kb-1',
        eventType: 'agent_execution',
        totalCount: 6,
        fallbackCount: 2,
        budgetExhaustedCount: 0,
        toolTimeoutCount: 0,
        providerErrorCount: 1,
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
      },
      {
        knowledgeBaseId: 'kb-1',
        eventType: 'index_build',
        totalCount: 3,
        fallbackCount: 0,
        budgetExhaustedCount: 0,
        toolTimeoutCount: 0,
        providerErrorCount: 0,
        insufficientEvidenceCount: 0,
        totalDurationMs: 0,
        totalFinalCitationCount: 0,
        totalRetrievedCitationCount: 0,
        successCount: 0,
        structuredRequestedCount: 3,
        structuredParsedCount: 2,
        totalFreshnessLagMs: 4500,
        totalNodes: 0,
        totalEdges: 0,
      },
    ]);

    mocks.systemLogRepository.listStructuredRagRecentEvents.mockResolvedValue([
      {
        id: 'evt-1',
        event: 'structured_rag.agent_execution',
        message: 'Structured RAG agent execution metric',
        createdAt: new Date('2026-03-22T10:20:00.000Z'),
        durationMs: 1200,
        metadata: { userId: 'user-1' },
      },
    ]);
  });

  it('builds summary, trend, alerts, and breakdown from rollup rows', async () => {
    const result = await structuredRagDashboardService.getSummary({
      userId: 'user-1',
      hours: 6,
      recentLimit: 4,
    });

    expect(mocks.rollupRepository.getSummaryRows).toHaveBeenCalledWith({
      since: new Date('2026-03-22T04:15:00.000Z'),
      userId: 'user-1',
      knowledgeBaseId: undefined,
    });
    expect(result.agent.fallbackRatio).toBe(40);
    expect(result.agent.avgDurationMs).toBe(1200);
    expect(result.index.structuredCoverage).toBe(60);
    expect(result.index.graphBuilds).toBe(2);
    expect(result.alerts.map((alert: { code: string }) => alert.code)).toContain('fallback_ratio');
    expect(result.trend[0]).toMatchObject({
      agentExecutions: 2,
      fallbackRatio: 50,
    });
    expect(result.trend[1]).toMatchObject({
      indexBuilds: 1,
      structuredCoverage: 100,
    });
    expect(result.knowledgeBaseBreakdown[0]).toMatchObject({
      knowledgeBaseId: 'kb-1',
      agentExecutions: 6,
    });
    expect(result.knowledgeBaseBreakdown[0]?.structuredCoverage).toBeCloseTo(66.67, 2);
    expect(result.knowledgeBaseBreakdown[0]?.avgFreshnessLagMs).toBe(1500);
    expect(result.recentEvents).toHaveLength(1);
  });
});
