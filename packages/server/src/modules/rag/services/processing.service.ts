import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@shared/logger';
import { structuredRagMetrics } from '@shared/observability';
import { withTransaction } from '@shared/db/db.utils';
import { db } from '@shared/db';
import { documents } from '@shared/db/schema/document/documents.schema';
import { eq, and, inArray } from 'drizzle-orm';
import { documentConfig, featureFlags, vlmConfig } from '@config/env';
import {
  documentRepository,
  documentVersionRepository,
  documentChunkRepository,
} from '@modules/document';
import { getEmbeddingProviderByType } from '@modules/embedding';
import { vectorRepository, ensureCollection } from '@modules/vector';
import type { VectorPoint } from '@modules/vector';
import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';
import { chunkingService } from './chunking.service';
import { knowledgeBaseService } from '@modules/knowledge-base';
import type { DocumentProcessingEnqueueOptions } from '../queue/document-processing.types';
import { documentParseRouterService } from '@modules/document-index/services/document-parse-router.service';
import { documentIndexService } from '@modules/document-index/services/document-index.service';
import { markdownStructureParser } from '@modules/document-index/services/parsers/markdown-structure.parser';
import { docxStructureParser } from '@modules/document-index/services/parsers/docx-structure.parser';
import { pdfStructureParser } from '@modules/document-index/services/parsers/pdf-structure.parser';
import type { ParsedDocumentStructure } from '@modules/document-index/services/parsers/types';
import { imageDescriptionService } from '@modules/document-index/services/image-description';
import { storageProvider } from '@modules/storage';

const logger = createLogger('processing.service');

// In-memory lock to prevent concurrent processing of the same document
const processingLocks = new Map<string, boolean>();

export const processingService = {
  /**
   * Attempt to acquire processing lock for a document
   * Uses both in-memory lock (for same-process concurrency) and
   * database status (for multi-process/distributed concurrency)
   *
   * @returns true if lock acquired, false if already processing
   */
  async acquireProcessingLock(documentId: string): Promise<boolean> {
    // Check in-memory lock first (fast path)
    if (processingLocks.get(documentId)) {
      logger.warn({ documentId }, 'Document already processing (in-memory lock)');
      return false;
    }

    // Set in-memory lock
    processingLocks.set(documentId, true);

    try {
      // Atomic database lock: only update status if not already processing
      // This handles distributed/multi-process scenarios
      const result = await db
        .update(documents)
        .set({ processingStatus: 'processing', processingError: null })
        .where(
          and(
            eq(documents.id, documentId),
            // Only acquire if status is 'pending' or 'failed', not 'processing'
            inArray(documents.processingStatus, ['pending', 'failed', 'completed'])
          )
        );

      // Check if we actually updated a row (lock acquired)
      if (result[0].affectedRows === 0) {
        // Another process is already processing this document
        processingLocks.delete(documentId);
        logger.warn({ documentId }, 'Document already processing (database lock)');
        return false;
      }

      return true;
    } catch (error) {
      // Release in-memory lock on error
      processingLocks.delete(documentId);
      throw error;
    }
  },

  /**
   * Release processing lock for a document
   */
  releaseProcessingLock(documentId: string): void {
    processingLocks.delete(documentId);
  },

  async resetToPending(documentId: string): Promise<void> {
    await documentRepository.updateProcessingStatus(documentId, 'pending', null);
  },

  async isStaleTargetVersion(documentId: string, targetDocumentVersion?: number): Promise<boolean> {
    if (!targetDocumentVersion) return false;

    const latestDocument = await documentRepository.findById(documentId);
    return !latestDocument || latestDocument.currentVersion !== targetDocumentVersion;
  },

  /**
   * Process a document for RAG (chunking, embedding, vector storage)
   *
   * Consistency strategy (improved):
   * 1. Acquire processing lock (in-memory + database) to prevent concurrent processing
   * 2. Generate all new chunks and embeddings BEFORE any deletions
   * 3. Use "insert new, then delete old" pattern to ensure data is never lost
   * 4. MySQL transaction covers chunk operations and counter updates
   * 5. Qdrant operations use upsert (idempotent) and cleanup old vectors after success
   * 6. Release lock in finally block to ensure cleanup
   */
  async processDocument(
    documentId: string,
    userId: string,
    request?: DocumentProcessingEnqueueOptions
  ): Promise<void> {
    const processStartedAt = Date.now();
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

    // Try to acquire lock
    const lockAcquired = await this.acquireProcessingLock(documentId);
    if (!lockAcquired) {
      logger.info({ documentId }, 'Skipping - document already being processed');
      return;
    }

    // Track old chunk IDs for cleanup
    let oldChunkIds: string[] = [];
    let collectionName: string | undefined;
    let indexBuildId: string | undefined;
    let parsedStructure: ParsedDocumentStructure | null = null;
    let routeMode: 'structured' | 'chunked' = 'chunked';
    let routeReason: string | undefined;
    let parseMethod = 'chunked';
    let parserRuntime = 'legacy-rag';
    let headingCount = 0;
    let knowledgeBaseId: string | undefined;
    let documentVersion: number | undefined;
    let documentUpdatedAtMs: number | undefined;

    try {
      // Get the document
      const document = await documentRepository.findById(documentId);
      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      if (
        request?.targetDocumentVersion !== undefined &&
        document.currentVersion !== request.targetDocumentVersion
      ) {
        logger.warn(
          {
            documentId,
            targetDocumentVersion: request.targetDocumentVersion,
            currentDocumentVersion: document.currentVersion,
            reason: request.reason,
          },
          'Skipping stale document processing job before processing'
        );
        await this.resetToPending(documentId);
        return;
      }

      // Save old chunk count for delta calculation
      const oldChunkCount = document.chunkCount;
      const kbId = document.knowledgeBaseId;
      knowledgeBaseId = kbId;
      documentVersion = document.currentVersion;
      documentUpdatedAtMs =
        document.updatedAt instanceof Date ? document.updatedAt.getTime() : undefined;

      // Get knowledge base embedding config
      const embeddingConfig = await knowledgeBaseService.getEmbeddingConfig(kbId);
      const { provider, dimensions, collectionName: collection } = embeddingConfig;
      collectionName = collection;

      // Ensure the collection exists
      await ensureCollection(collectionName, dimensions);

      // Get old chunk IDs before processing (for cleanup later)
      oldChunkIds = await documentChunkRepository.getChunkIdsByDocumentId(documentId);

      // Get the current version's text content
      const version = await documentVersionRepository.findByDocumentAndVersion(
        documentId,
        document.currentVersion
      );

      // Early exit: no text content
      if (!version?.textContent) {
        logger.warn({ documentId }, 'No text content available for processing');
        // Use transaction for consistency
        await withTransaction(async (tx) => {
          // Delete old chunks in transaction
          if (oldChunkIds.length > 0) {
            await documentChunkRepository.deleteByDocumentId(documentId, tx);
          }
          await documentRepository.updateProcessingStatus(
            documentId,
            'completed',
            undefined,
            0,
            tx
          );
          if (oldChunkCount > 0) {
            await knowledgeBaseService.incrementTotalChunks(kbId, -oldChunkCount, tx);
          }
        });
        // Clean up any existing vectors (idempotent)
        await this.safeDeleteVectors(collectionName, documentId);
        return;
      }

      const routeDecision = documentParseRouterService.decideRoute({
        documentType: document.documentType,
        textContent: version.textContent,
        userId,
        knowledgeBaseId: kbId,
      });
      routeMode = routeDecision.routeMode;
      routeReason = routeDecision.reason;

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
      indexBuildId = indexBuild.id;

      if (routeDecision.routeMode === 'structured') {
        try {
          if (document.documentType === 'markdown') {
            parsedStructure = markdownStructureParser.parse(version.textContent);
          } else if (document.documentType === 'docx') {
            parsedStructure = await docxStructureParser.parseFromStorage(version.storageKey);
          } else if (document.documentType === 'pdf') {
            parsedStructure = await pdfStructureParser.parseFromStorageWithImages(
              version.storageKey
            );
          }
        } catch (parseError) {
          logger.warn(
            { documentId, error: parseError },
            'Markdown structured parse failed; continuing with chunk fallback'
          );
        }
      }

      // Image description step for figure nodes (runs only when feature flag is on)
      if (
        parsedStructure &&
        featureFlags.imageDescriptionEnabled &&
        parsedStructure.extractedImages &&
        parsedStructure.extractedImages.length > 0
      ) {
        try {
          const imageDescStartMs = Date.now();
          const figureNodes = parsedStructure.nodes.filter((n) => n.nodeType === 'figure');
          const extractedImages = parsedStructure.extractedImages;

          // Find the document title for context
          const documentTitle =
            parsedStructure.nodes.find((n) => n.nodeType === 'document')?.title ?? undefined;

          // Upload images to storage and build description inputs
          const descriptionInputs = [];
          for (let i = 0; i < figureNodes.length && i < extractedImages.length; i++) {
            const figureNode = figureNodes[i]!;
            const image = extractedImages[i]!;

            // Upload image to storage (best effort)
            const storageKey = `documents/${documentId}/images/figure_${i}.png`;
            try {
              await storageProvider.upload(storageKey, image.buffer, image.mimeType);
              figureNode.imageStorageKey = storageKey;
            } catch (uploadError) {
              logger.warn(
                { documentId, nodeId: figureNode.id, error: uploadError },
                'Failed to upload figure image to storage'
              );
            }

            // Find section title from parent
            const parentNode = figureNode.parentId
              ? parsedStructure.nodes.find((n) => n.id === figureNode.parentId)
              : undefined;

            descriptionInputs.push({
              figureNodeId: figureNode.id,
              imageBuffer: image.buffer,
              imageMimeType: image.mimeType,
              captionText: figureNode.title ?? undefined,
              sectionTitle: parentNode?.title ?? undefined,
              documentTitle,
            });
          }

          if (descriptionInputs.length > 0) {
            const descResults = await imageDescriptionService.describeImages(descriptionInputs);

            let successCount = 0;
            let failCount = 0;
            for (const result of descResults) {
              const figureNode = parsedStructure.nodes.find((n) => n.id === result.nodeId);
              if (!figureNode) continue;

              figureNode.imageClassification = result.classification;

              if (result.success && result.description) {
                successCount++;
                figureNode.imageDescription = result.description;
                // Enrich the content so it participates in embedding
                const originalContent = figureNode.content;
                figureNode.content =
                  result.description +
                  (originalContent && originalContent !== '<!-- image -->'
                    ? `\n\n${originalContent}`
                    : '');
                figureNode.contentPreview = result.description.slice(0, 500);
              } else {
                failCount++;
              }
            }

            structuredRagMetrics.recordImageDescription({
              documentId,
              userId,
              knowledgeBaseId: kbId,
              totalFigureNodes: figureNodes.length,
              successfulDescriptions: successCount,
              failedDescriptions: failCount,
              totalLatencyMs: Date.now() - imageDescStartMs,
              vlmProvider: vlmConfig.provider,
              vlmModel: vlmConfig.model,
            });
          }
        } catch (imageDescError) {
          logger.warn(
            { documentId, error: imageDescError },
            'Image description step failed; figure nodes will retain original content'
          );
        }
      }

      // Chunk the text
      const chunks = chunkingService.chunkText(version.textContent);

      // Early exit: no chunks generated
      if (chunks.length === 0) {
        logger.warn({ documentId }, 'No chunks generated from text');
        await withTransaction(async (tx) => {
          await documentChunkRepository.deleteByDocumentId(documentId, tx);
          await documentRepository.updateProcessingStatus(
            documentId,
            'completed',
            undefined,
            0,
            tx
          );
          if (oldChunkCount > 0) {
            await knowledgeBaseService.incrementTotalChunks(kbId, -oldChunkCount, tx);
          }
        });
        await this.safeDeleteVectors(collectionName, documentId);
        await documentIndexService.completeBuild({
          indexVersionId: indexBuild.id,
          parseMethod: 'chunked-empty',
          parserRuntime: 'legacy-rag',
          headingCount: 0,
          parseDurationMs: Date.now() - processStartedAt,
        });
        structuredRagMetrics.recordIndexBuild({
          documentId,
          userId,
          knowledgeBaseId: kbId,
          documentVersion: document.currentVersion,
          routeMode,
          parseMethod: 'chunked-empty',
          parserRuntime: 'legacy-rag',
          headingCount: 0,
          parseDurationMs: Date.now() - processStartedAt,
          indexFreshnessLagMs: documentUpdatedAtMs ? Date.now() - documentUpdatedAtMs : undefined,
          success: true,
          reason: routeReason,
        });
        return;
      }

      // Generate embeddings using the KB's provider
      // This is done BEFORE any database modifications
      const embeddingProvider = getEmbeddingProviderByType(provider as EmbeddingProviderType);
      const batchSize = documentConfig.vectorBatchSize;
      const allChunkRecords: Array<{
        id: string;
        documentId: string;
        version: number;
        chunkIndex: number;
        content: string;
        metadata: { startOffset: number; endOffset: number };
        createdBy: string;
      }> = [];
      const allVectorPoints: VectorPoint[] = [];

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const texts = batch.map((c) => c.content);

        const embeddings = await embeddingProvider.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j]!;
          const embedding = embeddings[j]!;
          const chunkId = uuidv4();

          allChunkRecords.push({
            id: chunkId,
            documentId,
            version: document.currentVersion,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            metadata: chunk.metadata,
            createdBy: userId,
          });

          allVectorPoints.push({
            id: chunkId,
            vector: embedding,
            payload: {
              documentId,
              userId,
              knowledgeBaseId: kbId,
              version: document.currentVersion,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
            },
          });
        }
      }

      // Phase 1: Qdrant upsert (idempotent - can be safely retried)
      // Insert new vectors FIRST, before deleting old ones
      // This ensures search results are never empty during transition
      try {
        for (let i = 0; i < allVectorPoints.length; i += 100) {
          await vectorRepository.upsert(collectionName, allVectorPoints.slice(i, i + 100));
        }
      } catch (qdrantError) {
        logger.error(
          { documentId, collectionName, error: qdrantError },
          'Qdrant upsert failed - aborting before MySQL changes'
        );
        // Mark as failed, no data loss since we haven't modified MySQL yet
        await documentRepository.updateProcessingStatus(
          documentId,
          'failed',
          'Vector storage failed - please retry processing'
        );
        throw qdrantError;
      }

      if (await this.isStaleTargetVersion(documentId, request?.targetDocumentVersion)) {
        logger.warn(
          {
            documentId,
            targetDocumentVersion: request?.targetDocumentVersion,
            reason: request?.reason,
          },
          'Skipping stale document processing job after vector upsert'
        );
        if (allVectorPoints.length > 0) {
          try {
            await vectorRepository.deleteByIds(
              collectionName,
              allVectorPoints.map((point) => point.id)
            );
          } catch (cleanupError) {
            logger.warn(
              { documentId, collectionName, error: cleanupError },
              'Failed to clean up stale vectors after freshness check'
            );
          }
        }
        await this.resetToPending(documentId);
        if (indexBuildId) {
          await documentIndexService.supersedeBuild(indexBuildId);
        }
        return;
      }

      // Phase 2: MySQL transaction (atomic)
      // Insert new chunks FIRST, then delete old chunks
      const chunkDelta = chunks.length - oldChunkCount;
      await withTransaction(async (tx) => {
        // Insert new chunks first
        await documentChunkRepository.createMany(allChunkRecords, tx);

        // Delete old chunks (by their IDs, not by documentId, to avoid deleting new ones)
        if (oldChunkIds.length > 0) {
          await documentChunkRepository.deleteByIds(oldChunkIds, tx);
        }

        // Update document status and chunk count
        await documentRepository.updateProcessingStatus(
          documentId,
          'completed',
          undefined,
          chunks.length,
          tx
        );

        // Update KB total chunks
        if (chunkDelta !== 0) {
          await knowledgeBaseService.incrementTotalChunks(kbId, chunkDelta, tx);
        }
      });

      if (parsedStructure) {
        const graphResult = await documentIndexService.replaceGraph({
          documentId,
          indexVersionId: indexBuild.id,
          structure: parsedStructure,
        });
        if (graphResult) {
          structuredRagMetrics.recordIndexGraph({
            documentId,
            userId,
            knowledgeBaseId: kbId,
            indexVersionId: indexBuild.id,
            nodeCount: graphResult.nodeCount,
            edgeCount: graphResult.edgeCount,
          });
        }
      }

      // Phase 3: Cleanup old vectors in Qdrant (best effort)
      // This is safe because new vectors are already searchable
      if (oldChunkIds.length > 0) {
        try {
          await vectorRepository.deleteByIds(collectionName, oldChunkIds);
        } catch (cleanupError) {
          // Log but don't fail - orphaned vectors will be cleaned up eventually
          logger.warn(
            { documentId, collectionName, oldChunkIds, error: cleanupError },
            'Failed to delete old vectors - orphaned vectors may exist'
          );
        }
      }

      parseMethod =
        parsedStructure?.parseMethod ??
        (routeDecision.routeMode === 'structured' ? 'legacy-chunk-fallback' : 'chunked');
      parserRuntime = parsedStructure?.parserRuntime ?? 'legacy-rag';
      headingCount = parsedStructure?.headingCount ?? 0;
      const parseDurationMs = Date.now() - processStartedAt;

      await documentIndexService.completeBuild({
        indexVersionId: indexBuild.id,
        parseMethod,
        parserRuntime,
        headingCount,
        parseDurationMs,
      });
      structuredRagMetrics.recordIndexBuild({
        documentId,
        userId,
        knowledgeBaseId: kbId,
        documentVersion: document.currentVersion,
        routeMode,
        parseMethod,
        parserRuntime,
        headingCount,
        parseDurationMs,
        indexFreshnessLagMs: documentUpdatedAtMs ? Date.now() - documentUpdatedAtMs : undefined,
        success: true,
        reason: routeReason,
      });

      logger.info(
        {
          documentId,
          knowledgeBaseId: kbId,
          chunkCount: chunks.length,
          oldChunkCount,
          chunkDelta,
          provider: embeddingProvider.getName(),
          collectionName,
        },
        'Document processing completed'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ documentId, error: message }, 'Document processing failed');
      try {
        if (indexBuildId) {
          await documentIndexService.failBuild(indexBuildId, message);
        }
      } catch (indexError) {
        logger.error({ documentId, indexError }, 'Failed to mark document index build as failed');
      }
      try {
        await documentRepository.updateProcessingStatus(documentId, 'failed', message);
      } catch (documentStatusError) {
        logger.error(
          { documentId, updateError: documentStatusError },
          'Failed to update document status to failed'
        );
      }
      if (knowledgeBaseId && documentVersion !== undefined) {
        structuredRagMetrics.recordIndexBuild({
          documentId,
          userId,
          knowledgeBaseId,
          documentVersion,
          routeMode,
          parseMethod,
          parserRuntime,
          headingCount,
          parseDurationMs: undefined,
          indexFreshnessLagMs: documentUpdatedAtMs ? Date.now() - documentUpdatedAtMs : undefined,
          success: false,
          reason: routeReason,
          error: message,
        });
      }
    } finally {
      // Always release the lock
      this.releaseProcessingLock(documentId);
    }
  },

  /**
   * Safely delete vectors for a document (logs but doesn't throw on failure)
   */
  async safeDeleteVectors(collectionName: string, documentId: string): Promise<void> {
    try {
      await vectorRepository.deleteByDocumentId(collectionName, documentId);
    } catch (err) {
      logger.warn({ documentId, collectionName, err }, 'Failed to delete vectors (non-fatal)');
    }
  },
};
