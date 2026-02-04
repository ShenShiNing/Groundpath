import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@shared/logger';
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

export const processingService = {
  async processDocument(documentId: string, userId: string): Promise<void> {
    logger.info({ documentId }, 'Starting document processing');

    try {
      // Update status to processing
      await documentRepository.updateProcessingStatus(documentId, 'processing');

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
      const { provider, dimensions, collectionName } = embeddingConfig;

      // Ensure the collection exists
      await ensureCollection(collectionName, dimensions);

      // Get the current version's text content
      const version = await documentVersionRepository.findByDocumentAndVersion(
        documentId,
        document.currentVersion
      );

      // Early exit: no text content
      if (!version?.textContent) {
        logger.warn({ documentId }, 'No text content available for processing');
        await documentRepository.updateProcessingStatus(documentId, 'completed', undefined, 0);
        // Deduct old chunk count from KB
        if (oldChunkCount > 0) {
          await knowledgeBaseService.incrementTotalChunks(kbId, -oldChunkCount);
        }
        return;
      }

      // Delete old chunks for this document (MySQL + Qdrant)
      await documentChunkRepository.deleteByDocumentId(documentId);
      await vectorRepository.deleteByDocumentId(collectionName, documentId);

      // Chunk the text
      const chunks = chunkingService.chunkText(version.textContent);

      // Early exit: no chunks generated
      if (chunks.length === 0) {
        logger.warn({ documentId }, 'No chunks generated from text');
        await documentRepository.updateProcessingStatus(documentId, 'completed', undefined, 0);
        // Deduct old chunk count from KB
        if (oldChunkCount > 0) {
          await knowledgeBaseService.incrementTotalChunks(kbId, -oldChunkCount);
        }
        return;
      }

      // Generate embeddings using the KB's provider
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

      // Store in MySQL
      await documentChunkRepository.createMany(allChunkRecords);

      // Store in Qdrant (in batches of 100)
      for (let i = 0; i < allVectorPoints.length; i += 100) {
        await vectorRepository.upsert(collectionName, allVectorPoints.slice(i, i + 100));
      }

      // Update document status
      await documentRepository.updateProcessingStatus(
        documentId,
        'completed',
        undefined,
        chunks.length
      );

      // Update KB total chunks using delta calculation
      const chunkDelta = chunks.length - oldChunkCount;
      if (chunkDelta !== 0) {
        await knowledgeBaseService.incrementTotalChunks(kbId, chunkDelta);
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
    }
  },
};
