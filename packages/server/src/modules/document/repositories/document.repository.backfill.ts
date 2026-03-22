import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DocumentType } from '@groundpath/shared/types';
import { db } from '@core/db';
import { documents } from '@core/db/schema/document/documents.schema';
import type { DocumentBackfillCandidate } from './document.repository.types';

interface DocumentBackfillListOptions {
  knowledgeBaseId?: string;
  documentType?: DocumentType;
  includeIndexed?: boolean;
  includeProcessing?: boolean;
  excludeRunId?: string;
  limit?: number;
  offset?: number;
}

function buildBackfillConditions(options?: DocumentBackfillListOptions) {
  const conditions = [isNull(documents.deletedAt)];

  if (options?.knowledgeBaseId) {
    conditions.push(eq(documents.knowledgeBaseId, options.knowledgeBaseId));
  }

  if (options?.documentType) {
    conditions.push(eq(documents.documentType, options.documentType));
  }

  if (!options?.includeIndexed) {
    conditions.push(isNull(documents.activeIndexVersionId));
  }

  if (!options?.includeProcessing) {
    conditions.push(sql`${documents.processingStatus} != 'processing'`);
  }

  if (options?.excludeRunId) {
    conditions.push(sql`NOT EXISTS (
      SELECT 1
      FROM document_index_backfill_items items
      WHERE items.run_id = ${options.excludeRunId}
        AND items.document_id = ${documents.id}
    )`);
  }

  return conditions;
}

export const documentRepositoryBackfill = {
  async listBackfillCandidates(
    options?: DocumentBackfillListOptions
  ): Promise<{ documents: DocumentBackfillCandidate[]; hasMore: boolean }> {
    const limit = Math.max(options?.limit ?? 100, 1);
    const offset = Math.max(options?.offset ?? 0, 0);
    const result = await db
      .select({
        id: documents.id,
        userId: documents.userId,
        title: documents.title,
        knowledgeBaseId: documents.knowledgeBaseId,
        documentType: documents.documentType,
        currentVersion: documents.currentVersion,
        activeIndexVersionId: documents.activeIndexVersionId,
        processingStatus: documents.processingStatus,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(and(...buildBackfillConditions(options)))
      .orderBy(desc(documents.updatedAt), asc(documents.id))
      .limit(limit + 1)
      .offset(offset);

    return {
      documents: result.slice(0, limit),
      hasMore: result.length > limit,
    };
  },

  async countBackfillCandidates(options?: {
    knowledgeBaseId?: string;
    documentType?: DocumentType;
    includeIndexed?: boolean;
    includeProcessing?: boolean;
  }): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(documents)
      .where(and(...buildBackfillConditions(options)));

    return result[0]?.count ?? 0;
  },
};
