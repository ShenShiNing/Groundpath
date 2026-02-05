import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@shared/logger';
import { withTransaction } from '@shared/db/db.utils';
import { db } from '@shared/db';
import { documents } from '@shared/db/schema/document/documents.schema';
import { eq, and, inArray } from 'drizzle-orm';
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
  async processDocument(documentId: string, userId: string): Promise<void> {
    logger.info({ documentId }, 'Starting document processing');

    // Try to acquire lock
    const lockAcquired = await this.acquireProcessingLock(documentId);
    if (!lockAcquired) {
      logger.info({ documentId }, 'Skipping - document already being processed');
      return;
    }

    // Track old chunk IDs for cleanup
    let oldChunkIds: string[] = [];
    let collectionName: string | undefined;

    try {
      // Get the document
      const document = await documentRepository.findById(documentId);
      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Save old chunk count for delta calculation
      const oldChunkCount = document.chunkCount;
      const kbId = document.knowledgeBaseId;

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
        return;
      }

      // Generate embeddings using the KB's provider
      // This is done BEFORE any database modifications
      const embeddingProvider = getEmbeddingProviderByType(provider as EmbeddingProviderType);
      const batchSize = 20;
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
        await documentRepository.updateProcessingStatus(documentId, 'failed', message);
      } catch (updateError) {
        logger.error({ documentId, updateError }, 'Failed to update document status to failed');
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
