import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordStructuredRagMetric: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@modules/logs/public/structured-rag-observability', () => ({
  recordStructuredRagMetric: mocks.recordStructuredRagMetric,
}));

vi.mock('@core/logger', () => ({
  createLogger: () => mocks.logger,
}));

import { structuredRagMetrics } from '@core/observability/structured-rag.metrics';

describe('structuredRagMetrics', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
    mocks.recordStructuredRagMetric.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('persists agent execution metrics with a rollup payload', async () => {
    structuredRagMetrics.recordAgentExecution({
      conversationId: 'conv-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      provider: 'openai',
      stopReason: 'provider_error',
      durationMs: 1250,
      toolCallCount: 4,
      structuredToolCalls: 3,
      fallbackToolCalls: 1,
      externalToolCalls: 0,
      agentTraceSteps: 5,
      retrievedCitationCount: 4,
      finalCitationCount: 2,
    });

    await vi.waitFor(() => {
      expect(mocks.recordStructuredRagMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          log: expect.objectContaining({
            event: 'structured_rag.agent_execution',
            durationMs: 1250,
          }),
          rollup: expect.objectContaining({
            eventType: 'agent_execution',
            userId: 'user-1',
            knowledgeBaseId: 'kb-1',
            totalCount: 1,
            fallbackCount: 1,
            providerErrorCount: 1,
            totalDurationMs: 1250,
          }),
        })
      );
    });
  });

  it('persists chat completion metrics without a rollup payload', async () => {
    structuredRagMetrics.recordChatCompletion({
      conversationId: 'conv-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      provider: 'openai',
      transport: 'streaming',
      orchestration: 'agent',
      stopReason: 'answered',
      hasKnowledgeBase: true,
      structuredToolsAvailable: true,
      retrievedCitationCount: 3,
      finalCitationCount: 1,
    });

    await vi.waitFor(() => {
      expect(mocks.recordStructuredRagMetric).toHaveBeenCalled();
    });

    const [payload] = mocks.recordStructuredRagMetric.mock.calls[0] ?? [];
    expect(payload?.log).toEqual(
      expect.objectContaining({
        event: 'structured_rag.chat_completion',
      })
    );
    expect(payload && 'rollup' in payload).toBe(false);
  });
});
