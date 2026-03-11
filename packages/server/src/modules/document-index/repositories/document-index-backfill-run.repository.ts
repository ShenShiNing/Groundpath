import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDbContext, type Transaction } from '@shared/db/db.utils';
import {
  documentIndexBackfillRuns,
  type DocumentIndexBackfillRun,
  type NewDocumentIndexBackfillRun,
} from '@shared/db/schema/document/document-index-backfill-runs.schema';

export const documentIndexBackfillRunRepository = {
  async create(
    data: NewDocumentIndexBackfillRun,
    tx?: Transaction
  ): Promise<DocumentIndexBackfillRun> {
    const ctx = getDbContext(tx);
    await ctx.insert(documentIndexBackfillRuns).values(data);
    const result = await ctx
      .select()
      .from(documentIndexBackfillRuns)
      .where(eq(documentIndexBackfillRuns.id, data.id))
      .limit(1);
    return result[0]!;
  },

  async findById(id: string, tx?: Transaction): Promise<DocumentIndexBackfillRun | undefined> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .select()
      .from(documentIndexBackfillRuns)
      .where(eq(documentIndexBackfillRuns.id, id))
      .limit(1);
    return result[0];
  },

  async findLatestActiveRun(
    trigger: 'manual' | 'scheduled',
    tx?: Transaction
  ): Promise<DocumentIndexBackfillRun | undefined> {
    const ctx = getDbContext(tx);
    const result = await ctx
      .select()
      .from(documentIndexBackfillRuns)
      .where(
        and(
          eq(documentIndexBackfillRuns.trigger, trigger),
          inArray(documentIndexBackfillRuns.status, ['running', 'draining'])
        )
      )
      .orderBy(desc(documentIndexBackfillRuns.createdAt))
      .limit(1);
    return result[0];
  },

  async listRecent(limit: number = 20): Promise<DocumentIndexBackfillRun[]> {
    const ctx = getDbContext();
    return ctx
      .select()
      .from(documentIndexBackfillRuns)
      .orderBy(desc(documentIndexBackfillRuns.createdAt))
      .limit(limit);
  },

  async update(
    id: string,
    data: Partial<
      Pick<
        DocumentIndexBackfillRun,
        | 'status'
        | 'cursorOffset'
        | 'hasMore'
        | 'candidateCount'
        | 'enqueuedCount'
        | 'completedCount'
        | 'failedCount'
        | 'skippedCount'
        | 'lastError'
        | 'completedAt'
      >
    >,
    tx?: Transaction
  ): Promise<DocumentIndexBackfillRun | undefined> {
    const ctx = getDbContext(tx);
    await ctx
      .update(documentIndexBackfillRuns)
      .set(data)
      .where(eq(documentIndexBackfillRuns.id, id));
    return this.findById(id, tx);
  },

  async incrementCounts(
    id: string,
    deltas: Partial<
      Pick<
        DocumentIndexBackfillRun,
        'enqueuedCount' | 'completedCount' | 'failedCount' | 'skippedCount'
      >
    >,
    tx?: Transaction
  ): Promise<void> {
    const ctx = getDbContext(tx);
    const updateData: Record<string, unknown> = {};
    if (deltas.enqueuedCount) {
      updateData.enqueuedCount = sql`${documentIndexBackfillRuns.enqueuedCount} + ${deltas.enqueuedCount}`;
    }
    if (deltas.completedCount) {
      updateData.completedCount = sql`${documentIndexBackfillRuns.completedCount} + ${deltas.completedCount}`;
    }
    if (deltas.failedCount) {
      updateData.failedCount = sql`${documentIndexBackfillRuns.failedCount} + ${deltas.failedCount}`;
    }
    if (deltas.skippedCount) {
      updateData.skippedCount = sql`${documentIndexBackfillRuns.skippedCount} + ${deltas.skippedCount}`;
    }
    if (Object.keys(updateData).length === 0) return;
    await ctx
      .update(documentIndexBackfillRuns)
      .set(updateData)
      .where(eq(documentIndexBackfillRuns.id, id));
  },
};
