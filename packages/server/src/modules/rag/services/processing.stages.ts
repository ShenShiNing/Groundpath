import { v4 as uuidv4 } from 'uuid';
import { documentConfig } from '@config/env';
import type { EmbeddingProviderType } from '@modules/embedding/public/providers';
import { getEmbeddingProviderByType } from '@modules/embedding/public/providers';
import { documentChunkRepository, documentRepository } from '@modules/document/public/repositories';
import { documentIndexService } from '@modules/document-index/public/indexing';
import type { ParsedDocumentStructure } from '@modules/document-index/public/parsers';
import { chunkingService } from './chunking.service';
import { vectorRepository } from '@modules/vector/public/repositories';
import type { NewDocumentChunk } from '@core/db/schema/document/document-chunks.schema';
import { withTransaction } from '@core/db/db.utils';
import { createLogger } from '@core/logger';
import { structuredRagMetrics } from '@core/observability';
import type { VectorPoint } from '@modules/vector/public/types';
import type {
  ChunkProcessingArtifacts,
  DocumentProcessingResult,
  ProcessingDocument,
} from './processing.types';

const logger = createLogger('processing.service');

export async function resetToPending(documentId: string): Promise<void> {
  await documentRepository.updateProcessingStatus(documentId, 'pending', null);
}

export async function isStaleTargetVersion(
  documentId: string,
  targetDocumentVersion?: number
): Promise<boolean> {
  if (!targetDocumentVersion) return false;

  const latestDocument = await documentRepository.findById(documentId);
  return !latestDocument || latestDocument.currentVersion !== targetDocumentVersion;
}

export async function safeDeleteVectors(collectionName: string, documentId: string): Promise<void> {
  try {
    await vectorRepository.deleteByDocumentId(collectionName, documentId);
  } catch (error) {
    logger.warn({ documentId, collectionName, err: error }, 'Failed to delete vectors (non-fatal)');
  }
}

export async function completeWithoutText(input: {
  documentId: string;
  knowledgeBaseId: string;
  oldChunkCount: number;
  expectedPublishGeneration: number;
  indexBuildId: string;
  processStartedAt: number;
  document: ProcessingDocument;
  routeMode: 'structured' | 'chunked';
  routeReason?: string;
  documentUpdatedAtMs?: number;
}): Promise<DocumentProcessingResult> {
  return completeWithoutChunks({
    document: input.document,
    documentId: input.documentId,
    userId: input.document.userId,
    knowledgeBaseId: input.knowledgeBaseId,
    oldChunkCount: input.oldChunkCount,
    routeMode: input.routeMode,
    routeReason: input.routeReason,
    indexBuildId: input.indexBuildId,
    processStartedAt: input.processStartedAt,
    documentUpdatedAtMs: input.documentUpdatedAtMs,
    expectedPublishGeneration: input.expectedPublishGeneration,
  });
}

export async function completeWithoutChunks(input: {
  document: ProcessingDocument;
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
  oldChunkCount: number;
  routeMode: 'structured' | 'chunked';
  routeReason?: string;
  indexBuildId: string;
  processStartedAt: number;
  documentUpdatedAtMs?: number;
  expectedPublishGeneration: number;
}): Promise<DocumentProcessingResult> {
  const parseDurationMs = Date.now() - input.processStartedAt;
  const activated = await documentIndexService.completeBuild({
    indexVersionId: input.indexBuildId,
    parseMethod: 'chunked-empty',
    parserRuntime: 'legacy-rag',
    headingCount: 0,
    parseDurationMs,
    expectedPublishGeneration: input.expectedPublishGeneration,
    chunkCount: 0,
    knowledgeBaseId: input.knowledgeBaseId,
    chunkDelta: -input.oldChunkCount,
  });

  if (!activated) {
    return { outcome: 'skipped', reason: 'stale_publish_generation' };
  }

  structuredRagMetrics.recordIndexBuild({
    documentId: input.documentId,
    userId: input.userId,
    knowledgeBaseId: input.knowledgeBaseId,
    documentVersion: input.document.currentVersion,
    routeMode: input.routeMode,
    parseMethod: 'chunked-empty',
    parserRuntime: 'legacy-rag',
    headingCount: 0,
    parseDurationMs,
    indexFreshnessLagMs: input.documentUpdatedAtMs
      ? Date.now() - input.documentUpdatedAtMs
      : undefined,
    success: true,
    reason: input.routeReason,
  });

  return { outcome: 'completed', reason: 'no_chunks' };
}

export async function buildChunkArtifacts(input: {
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
  documentVersion: number;
  indexVersionId: string;
  providerType: EmbeddingProviderType;
  chunks: ReturnType<(typeof chunkingService)['chunkText']>;
}): Promise<ChunkProcessingArtifacts> {
  const embeddingProvider = getEmbeddingProviderByType(input.providerType);
  const batchSize = documentConfig.vectorBatchSize;
  const chunkRecords: NewDocumentChunk[] = [];
  const vectorPoints: VectorPoint[] = [];

  for (let i = 0; i < input.chunks.length; i += batchSize) {
    const batch = input.chunks.slice(i, i + batchSize);
    const texts = batch.map((chunk) => chunk.content);
    const embeddings = await embeddingProvider.embedBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j]!;
      const embedding = embeddings[j]!;
      const chunkId = uuidv4();

      chunkRecords.push({
        id: chunkId,
        documentId: input.documentId,
        version: input.documentVersion,
        indexVersionId: input.indexVersionId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: null,
        metadata: chunk.metadata,
        createdBy: input.userId,
        createdAt: new Date(),
      });

      vectorPoints.push({
        id: chunkId,
        vector: embedding,
        payload: {
          documentId: input.documentId,
          userId: input.userId,
          knowledgeBaseId: input.knowledgeBaseId,
          version: input.documentVersion,
          indexVersionId: input.indexVersionId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
        },
      });
    }
  }

  return {
    chunks: input.chunks,
    chunkRecords,
    vectorPoints,
    embeddingProvider,
  };
}

export async function upsertVectorPointsOrFail(input: {
  documentId: string;
  collectionName: string;
  vectorPoints: VectorPoint[];
}): Promise<void> {
  const batchSize = documentConfig.vectorUpsertBatchSize ?? documentConfig.vectorBatchSize;

  try {
    for (let i = 0; i < input.vectorPoints.length; i += batchSize) {
      await vectorRepository.upsert(
        input.collectionName,
        input.vectorPoints.slice(i, i + batchSize)
      );
    }
  } catch (error) {
    logger.error(
      { documentId: input.documentId, collectionName: input.collectionName, error },
      'Qdrant upsert failed - aborting before MySQL changes'
    );
    await documentRepository.updateProcessingStatus(
      input.documentId,
      'failed',
      'Vector storage failed - please retry processing'
    );
    throw error;
  }
}

export async function cleanupNewVectorsAfterStaleCheck(input: {
  documentId: string;
  collectionName: string;
  vectorPoints: VectorPoint[];
}): Promise<void> {
  if (input.vectorPoints.length === 0) {
    return;
  }

  try {
    await vectorRepository.deleteByIds(
      input.collectionName,
      input.vectorPoints.map((point) => point.id)
    );
  } catch (error) {
    logger.warn(
      { documentId: input.documentId, collectionName: input.collectionName, error },
      'Failed to clean up stale vectors after freshness check'
    );
  }
}

export async function persistChunkArtifacts(input: {
  documentId: string;
  chunkRecords: NewDocumentChunk[];
}): Promise<void> {
  await withTransaction(async (tx) => {
    await documentChunkRepository.createMany(input.chunkRecords, tx);
  });
}

export async function replaceStructuredGraph(input: {
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
  indexVersionId: string;
  parsedStructure: ParsedDocumentStructure;
}): Promise<void> {
  const graphResult = await documentIndexService.replaceGraph({
    documentId: input.documentId,
    indexVersionId: input.indexVersionId,
    structure: input.parsedStructure,
  });

  if (graphResult) {
    structuredRagMetrics.recordIndexGraph({
      documentId: input.documentId,
      userId: input.userId,
      knowledgeBaseId: input.knowledgeBaseId,
      indexVersionId: input.indexVersionId,
      nodeCount: graphResult.nodeCount,
      edgeCount: graphResult.edgeCount,
    });
  }
}

export async function completeSuccessfulBuild(input: {
  document: ProcessingDocument;
  documentId: string;
  userId: string;
  knowledgeBaseId: string;
  routeMode: 'structured' | 'chunked';
  routeReason?: string;
  parseMethod: string;
  parserRuntime: string;
  headingCount: number;
  processStartedAt: number;
  documentUpdatedAtMs?: number;
  indexBuildId: string;
  expectedPublishGeneration: number;
  chunkCount: number;
  chunkDelta: number;
}): Promise<boolean> {
  const parseDurationMs = Date.now() - input.processStartedAt;

  const activated = await documentIndexService.completeBuild({
    indexVersionId: input.indexBuildId,
    parseMethod: input.parseMethod,
    parserRuntime: input.parserRuntime,
    headingCount: input.headingCount,
    parseDurationMs,
    expectedPublishGeneration: input.expectedPublishGeneration,
    chunkCount: input.chunkCount,
    knowledgeBaseId: input.knowledgeBaseId,
    chunkDelta: input.chunkDelta,
  });

  if (!activated) {
    return false;
  }

  structuredRagMetrics.recordIndexBuild({
    documentId: input.documentId,
    userId: input.userId,
    knowledgeBaseId: input.knowledgeBaseId,
    documentVersion: input.document.currentVersion,
    routeMode: input.routeMode,
    parseMethod: input.parseMethod,
    parserRuntime: input.parserRuntime,
    headingCount: input.headingCount,
    parseDurationMs,
    indexFreshnessLagMs: input.documentUpdatedAtMs
      ? Date.now() - input.documentUpdatedAtMs
      : undefined,
    success: true,
    reason: input.routeReason,
  });
  return true;
}

export async function markProcessingFailedWithFence(input: {
  documentId: string;
  expectedPublishGeneration?: number;
  message: string;
}): Promise<boolean> {
  if (input.expectedPublishGeneration === undefined) {
    return documentRepository.updateProcessingStatus(input.documentId, 'failed', input.message);
  }

  return documentRepository.updateProcessingStatusWithPublishGeneration(
    input.documentId,
    input.expectedPublishGeneration,
    'failed',
    input.message
  );
}
