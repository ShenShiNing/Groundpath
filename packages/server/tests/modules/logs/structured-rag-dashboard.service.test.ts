import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MySqlDialect } from 'drizzle-orm/mysql-core';

const mocks = vi.hoisted(() => {
  const limitMock = vi.fn();
  const orderByMock = vi.fn(() => ({ limit: limitMock }));
  const whereMock = vi.fn(() => ({ orderBy: orderByMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const executeMock = vi.fn();

  return {
    dbMock: {
      select: selectMock,
      execute: executeMock,
    },
    selectMock,
    fromMock,
    whereMock,
    orderByMock,
    limitMock,
    executeMock,
    env: {
      structuredRagObservabilityConfig: {
        thresholds: {
          fallbackRatio: 20,
          budgetExhaustionRate: 10,
          providerErrorRate: 5,
          freshnessLagMs: 1000,
        },
      },
    },
  };
});

vi.mock('@core/db', () => ({
  db: mocks.dbMock,
}));

vi.mock('@config/env', () => mocks.env);

import { structuredRagDashboardService } from '@modules/logs/services/structured-rag-dashboard.service';

const dialect = new MySqlDialect();

function toSqlText(query: unknown): string {
  return dialect.sqlToQuery(query as never).sql.toLowerCase();
}

describe('structured-rag-dashboard.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T12:00:00.000Z'));

    mocks.selectMock.mockReturnValue({ from: mocks.fromMock });
    mocks.fromMock.mockReturnValue({ where: mocks.whereMock });
    mocks.whereMock.mockReturnValue({ orderBy: mocks.orderByMock });
    mocks.orderByMock.mockReturnValue({ limit: mocks.limitMock });
  });

  it('aggregates summary data with a single trend query and no JSON_EXTRACT filters', async () => {
    mocks.executeMock
      .mockResolvedValueOnce([
        [
          {
            totalExecutions: '10',
            fallbackCount: '3',
            budgetExhaustedCount: '2',
            toolTimeoutCount: '1',
            providerErrorCount: '1',
            insufficientEvidenceCount: '4',
            avgDurationMs: '1500.5',
            avgFinalCitationCount: '2.5',
            avgRetrievedCitationCount: '5.1',
            totalBuilds: '8',
            successCount: '7',
            structuredRequestedCount: '6',
            structuredParsedCount: '5',
            avgParseDurationMs: '2300',
            avgFreshnessLagMs: '900',
            graphBuilds: '4',
            totalNodes: '120',
            totalEdges: '240',
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([
        [
          {
            knowledgeBaseId: 'kb-1',
            totalExecutions: '6',
            fallbackCount: '2',
            providerErrorCount: '1',
            totalBuilds: '4',
            structuredParsedCount: '3',
            avgFreshnessLagMs: '800',
          },
          {
            knowledgeBaseId: 'kb-2',
            totalExecutions: '4',
            fallbackCount: '1',
            providerErrorCount: '0',
            totalBuilds: '4',
            structuredParsedCount: '2',
            avgFreshnessLagMs: '1000',
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([
        [
          {
            bucketIndex: '0',
            totalExecutions: '2',
            fallbackCount: '1',
            totalBuilds: '1',
            structuredParsedCount: '1',
          },
          {
            bucketIndex: '3',
            totalExecutions: '5',
            fallbackCount: '2',
            totalBuilds: '4',
            structuredParsedCount: '3',
          },
        ],
        [],
      ]);
    mocks.limitMock.mockResolvedValueOnce([
      {
        id: 'evt-1',
        event: 'structured_rag.agent_execution',
        message: 'Structured RAG agent execution metric',
        createdAt: new Date('2026-03-22T11:58:00.000Z'),
        durationMs: 1234,
        metadata: { knowledgeBaseId: 'kb-1', userId: 'user-1' },
      },
    ]);

    const result = await structuredRagDashboardService.getSummary({
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      hours: 7,
      recentLimit: 5,
    });

    expect(result.agent.totalExecutions).toBe(10);
    expect(result.agent.fallbackRatio).toBe(30);
    expect(result.agent.budgetExhaustionRate).toBe(20);
    expect(result.agent.avgDurationMs).toBe(1500.5);
    expect(result.index.parseSuccessRate).toBe(87.5);
    expect(result.index.structuredCoverage).toBe(62.5);
    expect(result.index.graphBuilds).toBe(4);
    expect(result.recentEvents).toHaveLength(1);
    expect(result.knowledgeBaseBreakdown).toEqual([
      {
        knowledgeBaseId: 'kb-1',
        agentExecutions: 6,
        fallbackRatio: 33.33,
        providerErrorRate: 16.67,
        structuredCoverage: 75,
        avgFreshnessLagMs: 800,
      },
      {
        knowledgeBaseId: 'kb-2',
        agentExecutions: 4,
        fallbackRatio: 25,
        providerErrorRate: 0,
        structuredCoverage: 50,
        avgFreshnessLagMs: 1000,
      },
    ]);
    expect(result.alerts.map((alert) => alert.code)).toEqual([
      'fallback_ratio',
      'budget_exhaustion',
      'provider_error',
    ]);

    expect(result.trend).toHaveLength(4);
    expect(result.trend[0]).toMatchObject({
      agentExecutions: 2,
      fallbackRatio: 50,
      structuredCoverage: 100,
      indexBuilds: 1,
    });
    expect(result.trend[1]).toMatchObject({
      agentExecutions: 0,
      fallbackRatio: 0,
      structuredCoverage: 0,
      indexBuilds: 0,
    });
    expect(result.trend[3]).toMatchObject({
      agentExecutions: 5,
      fallbackRatio: 40,
      structuredCoverage: 75,
      indexBuilds: 4,
    });
    expect(result.trend[0]?.bucketStart.toISOString()).toBe('2026-03-22T05:00:00.000Z');
    expect(result.trend[3]?.bucketEnd.toISOString()).toBe('2026-03-22T12:00:00.000Z');

    expect(mocks.executeMock).toHaveBeenCalledTimes(3);

    const summarySql = toSqlText(mocks.executeMock.mock.calls[0]?.[0]);
    const breakdownSql = toSqlText(mocks.executeMock.mock.calls[1]?.[0]);
    const trendSql = toSqlText(mocks.executeMock.mock.calls[2]?.[0]);

    expect(summarySql).toContain('metadata_used_fallback');
    expect(summarySql).toContain('metadata_stop_reason');
    expect(summarySql).toContain('metadata_user_id');
    expect(summarySql).toContain('metadata_knowledge_base_id');
    expect(summarySql).not.toContain('json_extract');

    expect(breakdownSql).toContain('group by `system_logs`.`metadata_knowledge_base_id`');
    expect(breakdownSql).not.toContain('json_extract');

    expect(trendSql).toContain('timestampdiff(second');
    expect(trendSql).toContain('metadata_structured_parsed');
    expect(trendSql).not.toContain('json_extract');
  });

  it('returns zero-filled buckets when no trend rows exist', async () => {
    mocks.executeMock
      .mockResolvedValueOnce([
        [
          {
            totalExecutions: '0',
            fallbackCount: '0',
            budgetExhaustedCount: '0',
            toolTimeoutCount: '0',
            providerErrorCount: '0',
            insufficientEvidenceCount: '0',
            avgDurationMs: '0',
            avgFinalCitationCount: '0',
            avgRetrievedCitationCount: '0',
            totalBuilds: '0',
            successCount: '0',
            structuredRequestedCount: '0',
            structuredParsedCount: '0',
            avgParseDurationMs: '0',
            avgFreshnessLagMs: '0',
            graphBuilds: '0',
            totalNodes: '0',
            totalEdges: '0',
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);
    mocks.limitMock.mockResolvedValueOnce([]);

    const result = await structuredRagDashboardService.getSummary({
      hours: 3,
      recentLimit: 2,
    });

    expect(result.trend).toHaveLength(3);
    expect(
      result.trend.every((point) => point.agentExecutions === 0 && point.indexBuilds === 0)
    ).toBe(true);
    expect(result.alerts).toEqual([]);
  });
});
