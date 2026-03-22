import { createLogger } from '@core/logger';
import { structuredRagMetrics } from '@core/observability';
import { documentIndexService } from '@modules/document-index/public/indexing';
import { markProcessingFailedWithFence } from './processing.stages';
import type { ProcessingContext } from './processing.types';

const logger = createLogger('processing.service');

function logCleanupFailure(
  documentId: string,
  field: 'indexError' | 'updateError',
  result: PromiseSettledResult<unknown>,
  message: string
): void {
  if (result.status === 'rejected') {
    logger.error({ documentId, [field]: result.reason }, message);
  }
}

export async function cleanupAfterProcessingFailure(
  documentId: string,
  context: ProcessingContext,
  message: string
): Promise<void> {
  const cleanupResults = await Promise.allSettled([
    context.state.indexBuildId
      ? documentIndexService.failBuild(context.state.indexBuildId, message)
      : Promise.resolve(),
    markProcessingFailedWithFence({
      documentId,
      expectedPublishGeneration: context.state.publishGeneration,
      message,
    }),
  ]);

  logCleanupFailure(
    documentId,
    'indexError',
    cleanupResults[0],
    'Failed to mark document index build as failed'
  );
  logCleanupFailure(
    documentId,
    'updateError',
    cleanupResults[1],
    'Failed to update document status to failed'
  );
}

export function recordProcessingFailureMetrics(
  context: ProcessingContext,
  message: string
): void {
  if (context.state.knowledgeBaseId && context.state.documentVersion !== undefined) {
    structuredRagMetrics.recordIndexBuild({
      documentId: context.documentId,
      userId: context.userId,
      knowledgeBaseId: context.state.knowledgeBaseId,
      documentVersion: context.state.documentVersion,
      routeMode: context.state.routeMode,
      parseMethod: context.state.parseMethod,
      parserRuntime: context.state.parserRuntime,
      headingCount: context.state.headingCount,
      parseDurationMs: undefined,
      indexFreshnessLagMs: context.state.documentUpdatedAtMs
        ? Date.now() - context.state.documentUpdatedAtMs
        : undefined,
      success: false,
      reason: context.state.routeReason,
      error: message,
    });
  }
}
