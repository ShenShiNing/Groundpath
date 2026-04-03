import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import { documentProcessingService } from '@modules/document/public/processing';
import { documentIndexService } from '@modules/document-index/public/indexing';
import { documentParseRouterService } from '@modules/document-index/public/routing';
import { knowledgeBaseService } from '@modules/knowledge-base/public/management';
import type { EmbeddingProviderType } from '@modules/embedding/public/providers';
import { ensureCollection } from '@modules/vector/public/qdrant';
import { chunkingService } from './chunking.service';
import {
  buildChunkArtifacts,
  cleanupNewVectorsAfterStaleCheck,
  completeSuccessfulBuild,
  completeWithoutChunks,
  completeWithoutText,
  isStaleTargetVersion,
  persistChunkArtifacts,
  replaceStructuredGraph,
  resetToPending,
  upsertVectorPointsOrFail,
} from './processing.stages';
import { prepareParsedStructure } from './processing.structure';
import type {
  DocumentProcessingResult,
  ProcessingContext,
  ProcessingDocument,
  ProcessingRuntimeState,
} from './processing.types';
import type { DocumentProcessingEnqueueOptions } from '../queue/document-processing.types';

const logger = createLogger('processing.service');

type RouteDecision = ReturnType<typeof documentParseRouterService.decideRoute>;

export type ProcessingPreparationOutcome =
  | { kind: 'result'; result: DocumentProcessingResult }
  | { kind: 'prepared'; data: PreparedProcessingData };

interface PreparedProcessingData {
  document: ProcessingDocument;
  oldChunkCount: number;
  knowledgeBaseId: string;
  collectionName: string;
  provider: EmbeddingProviderType;
  sourceText: string;
  indexBuildId: string;
  routeDecision: RouteDecision;
}

export function createProcessingContext(
  documentId: string,
  userId: string,
  request?: DocumentProcessingEnqueueOptions
): ProcessingContext {
  return {
    documentId,
    userId,
    request,
    processStartedAt: Date.now(),
    state: createInitialRuntimeState(),
  };
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

function captureDocumentState(
  context: ProcessingContext,
  document: ProcessingDocument
): { oldChunkCount: number; knowledgeBaseId: string } {
  const knowledgeBaseId = document.knowledgeBaseId;

  context.state.knowledgeBaseId = knowledgeBaseId;
  context.state.documentVersion = document.currentVersion;
  context.state.publishGeneration = document.publishGeneration;
  context.state.documentUpdatedAtMs =
    document.updatedAt instanceof Date ? document.updatedAt.getTime() : undefined;

  return {
    oldChunkCount: document.chunkCount,
    knowledgeBaseId,
  };
}

function logRouteSelection(
  documentId: string,
  document: ProcessingDocument,
  routeDecision: RouteDecision
): void {
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
}

function applyParseState(context: ProcessingContext, routeMode: RouteDecision['routeMode']): void {
  context.state.parseMethod =
    context.state.parsedStructure?.parseMethod ??
    (routeMode === 'structured' ? 'legacy-chunk-fallback' : 'chunked');
  context.state.parserRuntime = context.state.parsedStructure?.parserRuntime ?? 'legacy-rag';
  context.state.headingCount = context.state.parsedStructure?.headingCount ?? 0;
}

async function handleStaleAfterVectorUpsert(
  context: ProcessingContext,
  prepared: PreparedProcessingData,
  vectorPoints: Awaited<ReturnType<typeof buildChunkArtifacts>>['vectorPoints']
): Promise<DocumentProcessingResult | null> {
  if (
    !(await checkVersionStaleness({
      documentId: context.documentId,
      targetDocumentVersion: context.request?.targetDocumentVersion,
    }))
  ) {
    return null;
  }

  logger.warn(
    {
      documentId: context.documentId,
      targetDocumentVersion: context.request?.targetDocumentVersion,
      reason: context.request?.reason,
    },
    'Skipping stale document processing job after vector upsert'
  );

  await cleanupNewVectorsAfterStaleCheck({
    documentId: context.documentId,
    collectionName: prepared.collectionName,
    vectorPoints,
  });
  await resetToPending(context.documentId);
  await documentIndexService.supersedeBuild(prepared.indexBuildId);

  return { outcome: 'skipped', reason: 'stale_target_version' };
}

export async function prepareProcessingInputs(
  context: ProcessingContext
): Promise<ProcessingPreparationOutcome> {
  const document = await documentProcessingService.getProcessingSnapshot(context.documentId);
  if (!document) {
    throw Errors.notFound('Document');
  }

  if (
    await checkVersionStaleness({
      documentId: context.documentId,
      currentDocumentVersion: document.currentVersion,
      targetDocumentVersion: context.request?.targetDocumentVersion,
    })
  ) {
    logger.warn(
      {
        documentId: context.documentId,
        targetDocumentVersion: context.request?.targetDocumentVersion,
        currentDocumentVersion: document.currentVersion,
        reason: context.request?.reason,
      },
      'Skipping stale document processing job before processing'
    );
    await resetToPending(context.documentId);
    return { kind: 'result', result: { outcome: 'skipped', reason: 'stale_target_version' } };
  }

  const { oldChunkCount, knowledgeBaseId } = captureDocumentState(context, document);
  const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(knowledgeBaseId);
  const { provider, dimensions, collectionName } = embeddingConfig;
  context.state.collectionName = collectionName;

  await ensureCollection(collectionName, dimensions);

  const version = await documentProcessingService.getVersionContentSnapshot(
    context.documentId,
    document.currentVersion
  );
  const sourceText = version?.textContent ?? '';

  const routeDecision = documentParseRouterService.decideRoute({
    documentType: document.documentType,
    textContent: version?.textContent ?? null,
    userId: context.userId,
    knowledgeBaseId,
  });
  context.state.routeMode = routeDecision.routeMode;
  context.state.routeReason = routeDecision.reason;
  logRouteSelection(context.documentId, document, routeDecision);

  const indexBuild = await documentIndexService.startBuild({
    documentId: context.documentId,
    documentVersion: document.currentVersion,
    routeMode: routeDecision.routeMode,
    targetIndexVersion: context.request?.targetIndexVersion,
    createdBy: context.userId,
  });
  context.state.indexBuildId = indexBuild.id;

  context.state.parsedStructure = version
    ? await prepareParsedStructure({
        documentId: context.documentId,
        userId: context.userId,
        knowledgeBaseId,
        document,
        version,
        routeMode: routeDecision.routeMode,
      })
    : null;

  return {
    kind: 'prepared',
    data: {
      document,
      oldChunkCount,
      knowledgeBaseId,
      collectionName,
      provider: provider as EmbeddingProviderType,
      sourceText,
      indexBuildId: indexBuild.id,
      routeDecision,
    },
  };
}

export async function processPreparedDocument(
  context: ProcessingContext,
  prepared: PreparedProcessingData
): Promise<DocumentProcessingResult> {
  if (!prepared.sourceText) {
    logger.warn({ documentId: context.documentId }, 'No text content available for processing');
    return completeWithoutText({
      documentId: context.documentId,
      knowledgeBaseId: prepared.knowledgeBaseId,
      oldChunkCount: prepared.oldChunkCount,
      expectedPublishGeneration: context.state.publishGeneration!,
      indexBuildId: prepared.indexBuildId,
      processStartedAt: context.processStartedAt,
      document: prepared.document,
      routeMode: context.state.routeMode,
      routeReason: context.state.routeReason,
      documentUpdatedAtMs: context.state.documentUpdatedAtMs,
    });
  }

  const chunks = chunkingService.chunkText(prepared.sourceText);
  if (chunks.length === 0) {
    logger.warn({ documentId: context.documentId }, 'No chunks generated from text');
    return completeWithoutChunks({
      document: prepared.document,
      documentId: context.documentId,
      userId: context.userId,
      knowledgeBaseId: prepared.knowledgeBaseId,
      oldChunkCount: prepared.oldChunkCount,
      routeMode: context.state.routeMode,
      routeReason: context.state.routeReason,
      indexBuildId: prepared.indexBuildId,
      processStartedAt: context.processStartedAt,
      documentUpdatedAtMs: context.state.documentUpdatedAtMs,
      expectedPublishGeneration: context.state.publishGeneration!,
    });
  }

  const artifacts = await buildChunkArtifacts({
    documentId: context.documentId,
    userId: context.userId,
    knowledgeBaseId: prepared.knowledgeBaseId,
    documentVersion: prepared.document.currentVersion,
    indexVersionId: prepared.indexBuildId,
    providerType: prepared.provider,
    chunks,
  });

  await upsertVectorPointsOrFail({
    documentId: context.documentId,
    collectionName: prepared.collectionName,
    vectorPoints: artifacts.vectorPoints,
  });

  const staleResult = await handleStaleAfterVectorUpsert(context, prepared, artifacts.vectorPoints);
  if (staleResult) {
    return staleResult;
  }

  const chunkDelta = chunks.length - prepared.oldChunkCount;
  await persistChunkArtifacts({
    documentId: context.documentId,
    documentVersion: prepared.document.currentVersion,
    indexVersionId: prepared.indexBuildId,
    chunkArtifacts: artifacts.chunkArtifacts,
  });

  if (context.state.parsedStructure) {
    await replaceStructuredGraph({
      documentId: context.documentId,
      userId: context.userId,
      knowledgeBaseId: prepared.knowledgeBaseId,
      indexVersionId: prepared.indexBuildId,
      parsedStructure: context.state.parsedStructure,
    });
  }

  applyParseState(context, prepared.routeDecision.routeMode);

  const published = await completeSuccessfulBuild({
    document: prepared.document,
    documentId: context.documentId,
    userId: context.userId,
    knowledgeBaseId: prepared.knowledgeBaseId,
    routeMode: context.state.routeMode,
    routeReason: context.state.routeReason,
    parseMethod: context.state.parseMethod,
    parserRuntime: context.state.parserRuntime,
    headingCount: context.state.headingCount,
    processStartedAt: context.processStartedAt,
    documentUpdatedAtMs: context.state.documentUpdatedAtMs,
    indexBuildId: prepared.indexBuildId,
    expectedPublishGeneration: context.state.publishGeneration!,
    chunkCount: chunks.length,
    chunkDelta,
  });

  if (!published) {
    logger.warn(
      {
        documentId: context.documentId,
        indexVersionId: prepared.indexBuildId,
        expectedPublishGeneration: context.state.publishGeneration,
      },
      'Skipping publish because a newer processing generation already owns the document'
    );
    return { outcome: 'skipped', reason: 'stale_publish_generation' };
  }

  logger.info(
    {
      documentId: context.documentId,
      knowledgeBaseId: prepared.knowledgeBaseId,
      chunkCount: chunks.length,
      oldChunkCount: prepared.oldChunkCount,
      chunkDelta,
      provider: artifacts.embeddingProvider.getName(),
      collectionName: prepared.collectionName,
    },
    'Document processing completed'
  );

  return { outcome: 'completed' };
}
