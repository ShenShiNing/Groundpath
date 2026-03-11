import { and, asc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@shared/db';
import { getDbContext, type Transaction } from '@shared/db/db.utils';
import { documents, type Document } from '@shared/db/schema/document/documents.schema';
import type { StaleProcessingDocument } from './document.repository.types';

function buildProcessingUpdate(
  status: Document['processingStatus'],
  error?: string | null,
  chunkCount?: number
): Partial<Document> {
  const updateData: Partial<Document> = {
    processingStatus: status,
    processingStartedAt: status === 'processing' ? new Date() : null,
  };

  if (error !== undefined) {
    updateData.processingError = error;
  }

  if (chunkCount !== undefined) {
    updateData.chunkCount = chunkCount;
  }

  return updateData;
}

export const documentRepositoryProcessing = {
  async updateProcessingStatus(
    id: string,
    status: Document['processingStatus'],
    error?: string | null,
    chunkCount?: number,
    tx?: Transaction
  ): Promise<boolean> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .update(documents)
      .set(buildProcessingUpdate(status, error, chunkCount))
      .where(eq(documents.id, id));

    return result[0].affectedRows > 0;
  },

  async updateProcessingStatusWithPublishGeneration(
    id: string,
    expectedPublishGeneration: number,
    status: Document['processingStatus'],
    error?: string | null,
    chunkCount?: number,
    tx?: Transaction
  ): Promise<boolean> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .update(documents)
      .set(buildProcessingUpdate(status, error, chunkCount))
      .where(
        and(
          eq(documents.id, id),
          eq(documents.publishGeneration, expectedPublishGeneration),
          isNull(documents.deletedAt)
        )
      );

    return result[0].affectedRows > 0;
  },

  async publishBuild(input: {
    documentId: string;
    activeIndexVersionId: string;
    expectedPublishGeneration: number;
    chunkCount: number;
    tx?: Transaction;
  }): Promise<boolean> {
    const ctx = getDbContext(input.tx);
    const result = await ctx
      .update(documents)
      .set({
        activeIndexVersionId: input.activeIndexVersionId,
        processingStatus: 'completed',
        processingError: null,
        processingStartedAt: null,
        chunkCount: input.chunkCount,
      })
      .where(
        and(
          eq(documents.id, input.documentId),
          eq(documents.publishGeneration, input.expectedPublishGeneration),
          isNull(documents.deletedAt)
        )
      );

    return result[0].affectedRows > 0;
  },

  async listStaleProcessingDocuments(
    staleBefore: Date,
    limit: number
  ): Promise<StaleProcessingDocument[]> {
    const result = await db
      .select({
        id: documents.id,
        userId: documents.userId,
        knowledgeBaseId: documents.knowledgeBaseId,
        title: documents.title,
        processingStartedAt: documents.processingStartedAt,
      })
      .from(documents)
      .where(
        and(
          eq(documents.processingStatus, 'processing'),
          isNull(documents.deletedAt),
          isNotNull(documents.processingStartedAt),
          lt(documents.processingStartedAt, staleBefore)
        )
      )
      .orderBy(asc(documents.processingStartedAt), asc(documents.id))
      .limit(limit);

    return result.filter(
      (row): row is StaleProcessingDocument => row.processingStartedAt instanceof Date
    );
  },

  async resetStaleProcessingDocument(id: string, staleBefore: Date): Promise<boolean> {
    const result = await db
      .update(documents)
      .set({
        processingStatus: 'pending',
        processingError: null,
        processingStartedAt: null,
        publishGeneration: sql`${documents.publishGeneration} + 1`,
      })
      .where(
        and(
          eq(documents.id, id),
          eq(documents.processingStatus, 'processing'),
          isNull(documents.deletedAt),
          isNotNull(documents.processingStartedAt),
          lt(documents.processingStartedAt, staleBefore)
        )
      );

    return result[0].affectedRows > 0;
  },
};
