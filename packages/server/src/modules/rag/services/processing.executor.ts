import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import { structuredRagMetrics } from '@core/observability';
import { documentRepository, documentVersionRepository } from '@modules/document';
import { documentIndexService } from '@modules/document-index/services/document-index.service';
import { documentParseRouterService } from '@modules/document-index/services/document-parse-router.service';
import { knowledgeBaseService } from '@modules/knowledge-base';
import { ensureCollection } from '@modules/vector';
import type { EmbeddingProviderType } from '@modules/embedding';
import { chunkingService } from './chunking.service';
import { acquireProcessingLock, releaseProcessingLock } from './processing.lock';
import {
  buildChunkArtifacts,
  cleanupNewVectorsAfterStaleCheck,
  completeSuccessfulBuild,
  completeWithoutText,
  completeWithoutChunks,
  isStaleTargetVersion,
  markProcessingFailedWithFence,
  persistChunkArtifacts,
  replaceStructuredGraph,
  resetToPending,
  upsertVectorPointsOrFail,
} from './processing.stages';
import { prepareParsedStructure } from './processing.structure';
import type {
  DocumentProcessingResult,
  ProcessingContext,
  ProcessingRuntimeState,
} from './processing.types';
import type { DocumentProcessingEnqueueOptions } from '../queue/document-processing.types';

const logger = createLogger('processing.service');

async function checkVersionStaleness(input: {
  documentId: string;
  currentDocumentVersion?: number;
  targetDocumentVersion?: number;
}): Promise<boolean> {
  if (input.targetDocumentVersion === undefined) {
    return false;
  }

  if (input.currentDocumentVersion !== undefined) {
    return input.currentDocumentVersion !== input.targetDocumentVersion;
  }

  return isStaleTargetVersion(input.documentId, input.targetDocumentVersion);
}

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

async function cleanupAfterProcessingFailure(
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

function createInitialRuntimeState(): ProcessingRuntimeState {
  return {
    parsedStructure: null,
    routeMode: 'chunked',
    parseMethod: 'chunked',
    parserRuntime: 'legacy-rag',
    headingCount: 0,
  };
}

export async function processDocument(
  documentId: string,
  userId: string,
  request?: DocumentProcessingEnqueueOptions
): Promise<DocumentProcessingResult> {
  const context: ProcessingContext = {
    documentId,
    userId,
    request,
    processStartedAt: Date.now(),
    state: createInitialRuntimeState(),
  };

  logger.info(
    {
      documentId,
      userId,
      targetDocumentVersion: request?.targetDocumentVersion,
      targetIndexVersion: request?.targetIndexVersion,
      reason: request?.reason,
    },
    'Starting document processing'
  );

  const lockAcquired = await acquireProcessingLock(documentId);
  if (!lockAcquired) {
    logger.info({ documentId }, 'Skipping - document already being processed');
    return { outcome: 'skipped', reason: 'lock_not_acquired' };
  }

  try {
    const document = await documentRepository.findById(documentId);
    if (!document) {
      throw Errors.notFound('Document');
    }

    if (
      await checkVersionStaleness({
        documentId,
        currentDocumentVersion: document.currentVersion,
        targetDocumentVersion: request?.targetDocumentVersion,
      })
    ) {
      logger.warn(
        {
          documentId,
          targetDocumentVersion: request?.targetDocumentVersion,
          currentDocumentVersion: document.currentVersion,
          reason: request?.reason,
        },
        'Skipping stale document processing job before processing'
      );
      await resetToPending(documentId);
      return { outcome: 'skipped', reason: 'stale_target_version' };
    }

    const oldChunkCount = document.chunkCount;
    const knowledgeBaseId = document.knowledgeBaseId;
    context.state.knowledgeBaseId = knowledgeBaseId;
    context.state.documentVersion = document.currentVersion;
    context.state.publishGeneration = document.publishGeneration;
    context.state.documentUpdatedAtMs =
      document.updatedAt instanceof Date ? document.updatedAt.getTime() : undefined;

    const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(knowledgeBaseId);
    const { provider, dimensions, collectionName } = embeddingConfig;
    context.state.collectionName = collectionName;

    await ensureCollection(collectionName, dimensions);

    const version = await documentVersionRepository.findByDocumentAndVersion(
      documentId,
      document.currentVersion
    );
    const sourceText = version?.textContent ?? '';

    const routeDecision = documentParseRouterService.decideRoute({
      documentType: document.documentType,
      textContent: version?.textContent ?? null,
      userId,
      knowledgeBaseId,
    });
    context.state.routeMode = routeDecision.routeMode;
    context.state.routeReason = routeDecision.reason;

    logger.info(
      {
        documentId,
        documentVersion: document.currentVersion,
        documentType: document.documentType,
        routeMode: routeDecision.routeMode,
        routeReason: routeDecision.reason,
        estimatedTokens: routeDecision.estimatedTokens,
        thresholdTokens: routeDecision.thresholdTokens,
        rolloutMode: routeDecision.rolloutMode,
      },
      routeDecision.routeMode === 'structured'
        ? 'Structured route selected; using chunk pipeline as temporary fallback'
        : 'Chunk route selected for document processing'
    );

    const indexBuild = await documentIndexService.startBuild({
      documentId,
      documentVersion: document.currentVersion,
      routeMode: routeDecision.routeMode,
      targetIndexVersion: request?.targetIndexVersion,
      createdBy: userId,
    });
    context.state.indexBuildId = indexBuild.id;

    context.state.parsedStructure = version
      ? await prepareParsedStructure({
          documentId,
          userId,
          knowledgeBaseId,
          document,
          version,
          routeMode: routeDecision.routeMode,
        })
      : null;

    if (!sourceText) {
      logger.warn({ documentId }, 'No text content available for processing');
      return await completeWithoutText({
        documentId,
        knowledgeBaseId,
        oldChunkCount,
        expectedPublishGeneration: context.state.publishGeneration,
        indexBuildId: indexBuild.id,
        processStartedAt: context.processStartedAt,
        document,
        routeMode: context.state.routeMode,
        routeReason: context.state.routeReason,
        documentUpdatedAtMs: context.state.documentUpdatedAtMs,
      });
    }

    const chunks = chunkingService.chunkText(sourceText);
    if (chunks.length === 0) {
      logger.warn({ documentId }, 'No chunks generated from text');
      return await completeWithoutChunks({
        document,
        documentId,
        userId,
        knowledgeBaseId,
        oldChunkCount,
        routeMode: context.state.routeMode,
        routeReason: context.state.routeReason,
        indexBuildId: indexBuild.id,
        processStartedAt: context.processStartedAt,
        documentUpdatedAtMs: context.state.documentUpdatedAtMs,
        expectedPublishGeneration: context.state.publishGeneration,
      });
    }

    const artifacts = await buildChunkArtifacts({
      documentId,
      userId,
      knowledgeBaseId,
      documentVersion: document.currentVersion,
      indexVersionId: indexBuild.id,
      providerType: provider as EmbeddingProviderType,
      chunks,
    });

    await upsertVectorPointsOrFail({
      documentId,
      collectionName,
      vectorPoints: artifacts.vectorPoints,
    });

    if (
      await checkVersionStaleness({
        documentId,
        targetDocumentVersion: request?.targetDocumentVersion,
      })
    ) {
      logger.warn(
        {
          documentId,
          targetDocumentVersion: request?.targetDocumentVersion,
          reason: request?.reason,
        },
        'Skipping stale document processing job after vector upsert'
      );
      await cleanupNewVectorsAfterStaleCheck({
        documentId,
        collectionName,
        vectorPoints: artifacts.vectorPoints,
      });
      await resetToPending(documentId);
      if (context.state.indexBuildId) {
        await documentIndexService.supersedeBuild(context.state.indexBuildId);
      }
      return { outcome: 'skipped', reason: 'stale_target_version' };
    }

    const chunkDelta = chunks.length - oldChunkCount;
    await persistChunkArtifacts({
      documentId,
      chunkRecords: artifacts.chunkRecords,
    });

    if (context.state.parsedStructure) {
      await replaceStructuredGraph({
        documentId,
        userId,
        knowledgeBaseId,
        indexVersionId: indexBuild.id,
        parsedStructure: context.state.parsedStructure,
      });
    }

    context.state.parseMethod =
      context.state.parsedStructure?.parseMethod ??
      (routeDecision.routeMode === 'structured' ? 'legacy-chunk-fallback' : 'chunked');
    context.state.parserRuntime = context.state.parsedStructure?.parserRuntime ?? 'legacy-rag';
    context.state.headingCount = context.state.parsedStructure?.headingCount ?? 0;

    const published = await completeSuccessfulBuild({
      document,
      documentId,
      userId,
      knowledgeBaseId,
      routeMode: context.state.routeMode,
      routeReason: context.state.routeReason,
      parseMethod: context.state.parseMethod,
      parserRuntime: context.state.parserRuntime,
      headingCount: context.state.headingCount,
      processStartedAt: context.processStartedAt,
      documentUpdatedAtMs: context.state.documentUpdatedAtMs,
      indexBuildId: indexBuild.id,
      expectedPublishGeneration: context.state.publishGeneration,
      chunkCount: chunks.length,
      chunkDelta,
    });

    if (!published) {
      logger.warn(
        {
          documentId,
          indexVersionId: indexBuild.id,
          expectedPublishGeneration: context.state.publishGeneration,
        },
        'Skipping publish because a newer processing generation already owns the document'
      );
      return { outcome: 'skipped', reason: 'stale_publish_generation' };
    }

    logger.info(
      {
        documentId,
        knowledgeBaseId,
        chunkCount: chunks.length,
        oldChunkCount,
        chunkDelta,
        provider: artifacts.embeddingProvider.getName(),
        collectionName,
      },
      'Document processing completed'
    );

    return { outcome: 'completed' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ documentId, error: message }, 'Document processing failed');

    await cleanupAfterProcessingFailure(documentId, context, message);

    if (context.state.knowledgeBaseId && context.state.documentVersion !== undefined) {
      structuredRagMetrics.recordIndexBuild({
        documentId,
        userId,
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

    return { outcome: 'failed', reason: message };
  } finally {
    releaseProcessingLock(documentId);
  }
}
