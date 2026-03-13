import { and, eq, inArray } from 'drizzle-orm';
import { getDbContext, type Transaction } from '@core/db/db.utils';
import {
  documentIndexBackfillItems,
  type DocumentIndexBackfillItem,
  type NewDocumentIndexBackfillItem,
} from '@core/db/schema/document/document-index-backfill-items.schema';

export const documentIndexBackfillItemRepository = {
  async create(
    data: NewDocumentIndexBackfillItem,
    tx?: Transaction
  ): Promise<DocumentIndexBackfillItem> {
    const ctx = getDbContext(tx);
    await ctx.insert(documentIndexBackfillItems).values(data);
    const result = await ctx
      .select()
      .from(documentIndexBackfillItems)
      .where(eq(documentIndexBackfillItems.id, data.id))
      .limit(1);
    return result[0]!;
  },

  async findByRunAndDocument(
    runId: string,
    documentId: string,
    tx?: Transaction
  ): Promise<DocumentIndexBackfillItem | undefined> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .select()
      .from(documentIndexBackfillItems)
      .where(
        and(
          eq(documentIndexBackfillItems.runId, runId),
          eq(documentIndexBackfillItems.documentId, documentId)
        )
      )
      .limit(1);
    return result[0];
  },

  async updateStatusIf(
    runId: string,
    documentId: string,
    fromStatuses: DocumentIndexBackfillItem['status'][],
    data: Partial<
      Pick<DocumentIndexBackfillItem, 'status' | 'jobId' | 'error' | 'enqueuedAt' | 'completedAt'>
    >,
    tx?: Transaction
  ): Promise<boolean> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .update(documentIndexBackfillItems)
      .set(data)
      .where(
        and(
          eq(documentIndexBackfillItems.runId, runId),
          eq(documentIndexBackfillItems.documentId, documentId),
          inArray(documentIndexBackfillItems.status, fromStatuses)
        )
      );
    return result[0]?.affectedRows > 0;
  },
};
