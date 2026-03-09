import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    structuredRagObservabilityConfig: {
      alertsEnabled: true,
      alertEmailTo: ['ops@example.com'],
      alertWindowHours: 24,
      alertScheduleCron: '0 5 * * *',
      thresholds: {
        fallbackRatio: 35,
        budgetExhaustionRate: 10,
        providerErrorRate: 3,
        freshnessLagMs: 300000,
      },
      reportDefaultDays: 30,
    },
  },
  reportService: {
    generateReport: vi.fn(),
  },
  systemLogRepository: {
    getLatestStructuredRagAlertEvents: vi.fn(),
    create: vi.fn(),
  },
  emailService: {
    sendEmail: vi.fn(),
  },
  systemLogger: {
    performanceEvent: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@config/env', () => mocks.env);

vi.mock('@modules/logs/services/structured-rag-report.service', () => ({
  structuredRagReportService: mocks.reportService,
}));

vi.mock('@modules/logs/repositories/system-log.repository', () => ({
  systemLogRepository: mocks.systemLogRepository,
}));

vi.mock('@modules/auth', () => ({
  emailService: mocks.emailService,
}));

vi.mock('@shared/logger/system-logger', () => ({
  systemLogger: mocks.systemLogger,
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => mocks.logger,
}));

import { structuredRagAlertService } from '@modules/logs/services/structured-rag-alert.service';

describe('structuredRagAlertService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reportService.generateReport.mockResolvedValue({
      generatedAt: new Date('2026-03-09T00:00:00.000Z'),
      windowDays: 1,
      filters: { knowledgeBaseId: null, userScoped: false },
      highlights: ['Fallback ratio elevated'],
      markdown: '# Structured RAG Report',
      summary: {
        windowHours: 24,
        trendGranularity: 'hour',
        filters: { knowledgeBaseId: null },
        agent: {
          totalExecutions: 10,
          fallbackRatio: 40,
          budgetExhaustionRate: 5,
          toolTimeoutRate: 0,
          providerErrorRate: 1,
          insufficientEvidenceRate: 2,
          avgDurationMs: 1200,
          avgFinalCitationCount: 1.4,
          avgRetrievedCitationCount: 2.2,
        },
        index: {
          totalBuilds: 8,
          parseSuccessRate: 90,
          structuredRequestRate: 80,
          structuredCoverage: 70,
          avgParseDurationMs: 900,
          avgFreshnessLagMs: 1500,
          graphBuilds: 4,
          totalNodes: 120,
          totalEdges: 80,
        },
        alerts: [
          {
            code: 'fallback_ratio',
            severity: 'warn',
            title: 'Fallback ratio elevated',
            description: 'Vector fallback is being used more often than expected.',
            value: 40,
            threshold: 35,
          },
        ],
        trend: [],
        knowledgeBaseBreakdown: [],
        recentEvents: [],
      },
    });
    mocks.systemLogRepository.getLatestStructuredRagAlertEvents.mockResolvedValue([]);
  });

  it('sends alert email when active alerts exist and external delivery is enabled', async () => {
    const result = await structuredRagAlertService.checkAndNotify();

    expect(mocks.emailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['ops@example.com'],
        subject: expect.stringContaining('Structured RAG Alerts'),
      })
    );
    expect(result).toEqual({
      alertsTriggered: 1,
      emailSent: true,
      recipients: ['ops@example.com'],
      notifiedAlertCodes: ['fallback_ratio'],
      suppressedAlertCodes: [],
    });
    expect(mocks.systemLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'structured-rag.alert.sent',
      })
    );
  });

  it('skips email when there are no active alerts', async () => {
    mocks.reportService.generateReport.mockResolvedValueOnce({
      generatedAt: new Date('2026-03-09T00:00:00.000Z'),
      windowDays: 1,
      filters: { knowledgeBaseId: null, userScoped: false },
      highlights: [],
      markdown: '# Structured RAG Report',
      summary: {
        windowHours: 24,
        trendGranularity: 'hour',
        filters: { knowledgeBaseId: null },
        agent: {
          totalExecutions: 10,
          fallbackRatio: 10,
          budgetExhaustionRate: 1,
          toolTimeoutRate: 0,
          providerErrorRate: 0,
          insufficientEvidenceRate: 1,
          avgDurationMs: 1200,
          avgFinalCitationCount: 1.4,
          avgRetrievedCitationCount: 2.2,
        },
        index: {
          totalBuilds: 8,
          parseSuccessRate: 90,
          structuredRequestRate: 80,
          structuredCoverage: 70,
          avgParseDurationMs: 900,
          avgFreshnessLagMs: 1500,
          graphBuilds: 4,
          totalNodes: 120,
          totalEdges: 80,
        },
        alerts: [],
        trend: [],
        knowledgeBaseBreakdown: [],
        recentEvents: [],
      },
    });

    const result = await structuredRagAlertService.checkAndNotify();

    expect(mocks.emailService.sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      alertsTriggered: 0,
      emailSent: false,
      recipients: ['ops@example.com'],
      notifiedAlertCodes: [],
      suppressedAlertCodes: [],
    });
  });

  it('suppresses alerts during cooldown when the same severity was already sent recently', async () => {
    mocks.systemLogRepository.getLatestStructuredRagAlertEvents.mockResolvedValueOnce([
      {
        id: 'log-1',
        event: 'structured-rag.alert.sent',
        code: 'fallback_ratio',
        severity: 'warn',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ]);

    const result = await structuredRagAlertService.checkAndNotify();

    expect(mocks.emailService.sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      alertsTriggered: 1,
      emailSent: false,
      recipients: ['ops@example.com'],
      notifiedAlertCodes: [],
      suppressedAlertCodes: ['fallback_ratio'],
    });
    expect(mocks.systemLogRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'structured-rag.alert.suppressed',
      })
    );
  });

  it('re-sends alerts when severity escalates even inside cooldown', async () => {
    mocks.reportService.generateReport.mockResolvedValueOnce({
      generatedAt: new Date('2026-03-09T00:00:00.000Z'),
      windowDays: 1,
      filters: { knowledgeBaseId: null, userScoped: false },
      highlights: ['Fallback ratio elevated'],
      markdown: '# Structured RAG Report',
      summary: {
        windowHours: 24,
        trendGranularity: 'hour',
        filters: { knowledgeBaseId: null },
        agent: {
          totalExecutions: 10,
          fallbackRatio: 60,
          budgetExhaustionRate: 5,
          toolTimeoutRate: 0,
          providerErrorRate: 1,
          insufficientEvidenceRate: 2,
          avgDurationMs: 1200,
          avgFinalCitationCount: 1.4,
          avgRetrievedCitationCount: 2.2,
        },
        index: {
          totalBuilds: 8,
          parseSuccessRate: 90,
          structuredRequestRate: 80,
          structuredCoverage: 70,
          avgParseDurationMs: 900,
          avgFreshnessLagMs: 1500,
          graphBuilds: 4,
          totalNodes: 120,
          totalEdges: 80,
        },
        alerts: [
          {
            code: 'fallback_ratio',
            severity: 'error',
            title: 'Fallback ratio elevated',
            description: 'Vector fallback is being used more often than expected.',
            value: 60,
            threshold: 35,
          },
        ],
        trend: [],
        knowledgeBaseBreakdown: [],
        recentEvents: [],
      },
    });
    mocks.systemLogRepository.getLatestStructuredRagAlertEvents.mockResolvedValueOnce([
      {
        id: 'log-1',
        event: 'structured-rag.alert.sent',
        code: 'fallback_ratio',
        severity: 'warn',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ]);

    const result = await structuredRagAlertService.checkAndNotify();

    expect(mocks.emailService.sendEmail).toHaveBeenCalled();
    expect(result.notifiedAlertCodes).toEqual(['fallback_ratio']);
    expect(result.suppressedAlertCodes).toEqual([]);
  });
});
