import type { AgentStopReason } from '@groundpath/shared/types';
import { createLogger } from '@core/logger';
import type { RecordStructuredRagMetricInput } from '@modules/logs/public/structured-rag-observability';

const logger = createLogger('structured-rag.metrics');

function persistMetric(params: RecordStructuredRagMetricInput): void {
  if (process.env.NODE_ENV === 'test') return;

  void import('@modules/logs/public/structured-rag-observability')
    .then(({ recordStructuredRagMetric }) => {
      return recordStructuredRagMetric(params);
    })
    .catch((error) => {
      logger.warn(
        { err: error, event: params.log.event },
        'Failed to persist structured RAG metric'
      );
    });
}

export interface StructuredRagAgentExecutionMetric {
  conversationId: string;
  userId: string;
  knowledgeBaseId?: string | null;
  provider: string;
  stopReason?: AgentStopReason;
  durationMs: number;
  toolCallCount: number;
  structuredToolCalls: number;
  fallbackToolCalls: number;
  externalToolCalls: number;
  agentTraceSteps: number;
  retrievedCitationCount: number;
  finalCitationCount: number;
}

export interface StructuredRagChatMetric {
  conversationId: string;
  userId: string;
  knowledgeBaseId?: string | null;
  provider: string;
  transport: 'streaming' | 'non_streaming';
  orchestration: 'agent' | 'legacy';
  stopReason?: AgentStopReason;
  hasKnowledgeBase: boolean;
  structuredToolsAvailable: boolean;
  retrievedCitationCount: number;
  finalCitationCount: number;
}

export interface StructuredRagIndexBuildMetric {
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
  documentVersion: number;
  routeMode: 'structured' | 'chunked';
  parseMethod: string;
  parserRuntime: string;
  headingCount: number;
  parseDurationMs?: number;
  indexFreshnessLagMs?: number;
  success: boolean;
  reason?: string;
  error?: string;
}

export interface StructuredRagIndexGraphMetric {
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
  indexVersionId: string;
  nodeCount: number;
  edgeCount: number;
}

export interface StructuredRagImageDescriptionMetric {
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
  totalFigureNodes: number;
  successfulDescriptions: number;
  failedDescriptions: number;
  totalLatencyMs: number;
  vlmProvider: string;
  vlmModel: string;
}

export const structuredRagMetrics = {
  recordAgentExecution(input: StructuredRagAgentExecutionMetric): void {
    const metadata = {
      conversationId: input.conversationId,
      userId: input.userId,
      knowledgeBaseId: input.knowledgeBaseId ?? null,
      provider: input.provider,
      stopReason: input.stopReason ?? null,
      toolCallCount: input.toolCallCount,
      structuredToolCalls: input.structuredToolCalls,
      fallbackToolCalls: input.fallbackToolCalls,
      externalToolCalls: input.externalToolCalls,
      usedFallback: input.fallbackToolCalls > 0,
      budgetExhausted: input.stopReason === 'budget_exhausted',
      toolTimedOut: input.stopReason === 'tool_timeout',
      providerError: input.stopReason === 'provider_error',
      insufficientEvidence: input.stopReason === 'insufficient_evidence',
      agentTraceSteps: input.agentTraceSteps,
      retrievedCitationCount: input.retrievedCitationCount,
      finalCitationCount: input.finalCitationCount,
    };
    logger.info(
      { metric: 'structured_rag.agent_execution', durationMs: input.durationMs, ...metadata },
      'Structured RAG agent execution metric'
    );
    persistMetric({
      log: {
        level: 'info',
        category: 'performance',
        event: 'structured_rag.agent_execution',
        message: 'Structured RAG agent execution metric',
        source: 'structured-rag',
        durationMs: input.durationMs,
        metadata,
      },
      rollup: {
        eventType: 'agent_execution',
        userId: input.userId,
        knowledgeBaseId: input.knowledgeBaseId,
        totalCount: 1,
        fallbackCount: input.fallbackToolCalls > 0 ? 1 : 0,
        budgetExhaustedCount: input.stopReason === 'budget_exhausted' ? 1 : 0,
        toolTimeoutCount: input.stopReason === 'tool_timeout' ? 1 : 0,
        providerErrorCount: input.stopReason === 'provider_error' ? 1 : 0,
        insufficientEvidenceCount: input.stopReason === 'insufficient_evidence' ? 1 : 0,
        totalDurationMs: input.durationMs,
        totalFinalCitationCount: input.finalCitationCount,
        totalRetrievedCitationCount: input.retrievedCitationCount,
      },
    });
  },

  recordChatCompletion(input: StructuredRagChatMetric): void {
    const metadata = {
      conversationId: input.conversationId,
      userId: input.userId,
      knowledgeBaseId: input.knowledgeBaseId ?? null,
      provider: input.provider,
      transport: input.transport,
      orchestration: input.orchestration,
      stopReason: input.stopReason ?? null,
      hasKnowledgeBase: input.hasKnowledgeBase,
      structuredToolsAvailable: input.structuredToolsAvailable,
      retrievedCitationCount: input.retrievedCitationCount,
      finalCitationCount: input.finalCitationCount,
    };
    logger.info(
      { metric: 'structured_rag.chat_completion', ...metadata },
      'Structured RAG chat completion metric'
    );
    persistMetric({
      log: {
        level: 'info',
        category: 'performance',
        event: 'structured_rag.chat_completion',
        message: 'Structured RAG chat completion metric',
        source: 'structured-rag',
        metadata,
      },
    });
  },

  recordIndexBuild(input: StructuredRagIndexBuildMetric): void {
    const metadata = {
      documentId: input.documentId,
      userId: input.userId,
      knowledgeBaseId: input.knowledgeBaseId,
      documentVersion: input.documentVersion,
      routeMode: input.routeMode,
      parseMethod: input.parseMethod,
      parserRuntime: input.parserRuntime,
      headingCount: input.headingCount,
      indexFreshnessLagMs: input.indexFreshnessLagMs,
      success: input.success,
      structuredRequested: input.routeMode === 'structured',
      structuredParsed: input.parseMethod === 'structured',
      fallbackToChunk: input.parseMethod === 'legacy-chunk-fallback',
      reason: input.reason ?? null,
      error: input.error ?? null,
    };
    logger.info(
      { metric: 'structured_rag.index_build', parseDurationMs: input.parseDurationMs, ...metadata },
      'Structured RAG index build metric'
    );
    persistMetric({
      log: {
        level: input.success ? 'info' : 'warn',
        category: 'performance',
        event: 'structured_rag.index_build',
        message: input.success
          ? 'Structured RAG index build metric'
          : 'Structured RAG index build failure metric',
        source: 'structured-rag',
        durationMs: input.parseDurationMs ?? null,
        metadata,
      },
      rollup: {
        eventType: 'index_build',
        userId: input.userId,
        knowledgeBaseId: input.knowledgeBaseId,
        totalCount: 1,
        successCount: input.success ? 1 : 0,
        structuredRequestedCount: input.routeMode === 'structured' ? 1 : 0,
        structuredParsedCount: input.parseMethod === 'structured' ? 1 : 0,
        totalDurationMs: input.parseDurationMs ?? 0,
        totalFreshnessLagMs: input.indexFreshnessLagMs ?? 0,
      },
    });
  },

  recordIndexGraph(input: StructuredRagIndexGraphMetric): void {
    const metadata = {
      documentId: input.documentId,
      userId: input.userId,
      knowledgeBaseId: input.knowledgeBaseId,
      indexVersionId: input.indexVersionId,
      nodeCount: input.nodeCount,
      edgeCount: input.edgeCount,
    };
    logger.info(
      { metric: 'structured_rag.index_graph', ...metadata },
      'Structured RAG index graph metric'
    );
    persistMetric({
      log: {
        level: 'info',
        category: 'performance',
        event: 'structured_rag.index_graph',
        message: 'Structured RAG index graph metric',
        source: 'structured-rag',
        metadata,
      },
      rollup: {
        eventType: 'index_graph',
        userId: input.userId,
        knowledgeBaseId: input.knowledgeBaseId,
        totalCount: 1,
        totalNodes: input.nodeCount,
        totalEdges: input.edgeCount,
      },
    });
  },

  recordImageDescription(input: StructuredRagImageDescriptionMetric): void {
    const metadata = {
      documentId: input.documentId,
      userId: input.userId,
      knowledgeBaseId: input.knowledgeBaseId,
      totalFigureNodes: input.totalFigureNodes,
      successfulDescriptions: input.successfulDescriptions,
      failedDescriptions: input.failedDescriptions,
      vlmProvider: input.vlmProvider,
      vlmModel: input.vlmModel,
    };
    logger.info(
      {
        metric: 'structured_rag.image_description',
        totalLatencyMs: input.totalLatencyMs,
        ...metadata,
      },
      'Structured RAG image description metric'
    );
    persistMetric({
      log: {
        level: 'info',
        category: 'performance',
        event: 'structured_rag.image_description',
        message: 'Structured RAG image description metric',
        source: 'structured-rag',
        durationMs: input.totalLatencyMs,
        metadata,
      },
    });
  },
};
