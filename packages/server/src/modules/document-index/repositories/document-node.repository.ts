import { eq, inArray } from 'drizzle-orm';
import { db } from '@core/db';
import { getDbContext, type Transaction } from '@core/db/db.utils';
import {
  documentNodes,
  type DocumentNode,
  type NewDocumentNode,
} from '@core/db/schema/document/document-nodes.schema';

export const documentNodeRepository = {
  async createMany(data: NewDocumentNode[], tx?: Transaction): Promise<void> {
    if (data.length === 0) return;
    const ctx = getDbContext(tx);
    await ctx.insert(documentNodes).values(data);
  },

  async findById(id: string): Promise<DocumentNode | undefined> {
    const result = await db.select().from(documentNodes).where(eq(documentNodes.id, id)).limit(1);
    return result[0];
  },

  async findByIds(ids: string[]): Promise<DocumentNode[]> {
    if (ids.length === 0) return [];
    return db.select().from(documentNodes).where(inArray(documentNodes.id, ids));
  },

  async listByIndexVersionId(indexVersionId: string): Promise<DocumentNode[]> {
    return db
      .select()
      .from(documentNodes)
      .where(eq(documentNodes.indexVersionId, indexVersionId))
      .orderBy(documentNodes.orderNo);
  },

  async deleteByIndexVersionId(indexVersionId: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.delete(documentNodes).where(eq(documentNodes.indexVersionId, indexVersionId));
  },
};
