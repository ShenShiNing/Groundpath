import { eq, inArray } from 'drizzle-orm';
import { db } from '@core/db';
import { getDbContext, type Transaction } from '@core/db/db.utils';
import {
  documentNodeContents,
  type DocumentNodeContent,
  type NewDocumentNodeContent,
} from '@core/db/schema/document/document-node-contents.schema';

export const documentNodeContentRepository = {
  async createMany(data: NewDocumentNodeContent[], tx?: Transaction): Promise<void> {
    if (data.length === 0) return;
    const ctx = getDbContext(tx);
    await ctx.insert(documentNodeContents).values(data);
  },

  async findByNodeId(nodeId: string): Promise<DocumentNodeContent | undefined> {
    const result = await db
      .select()
      .from(documentNodeContents)
      .where(eq(documentNodeContents.nodeId, nodeId))
      .limit(1);
    return result[0];
  },

  async listByNodeIds(nodeIds: string[]): Promise<DocumentNodeContent[]> {
    if (nodeIds.length === 0) return [];
    return db
      .select()
      .from(documentNodeContents)
      .where(inArray(documentNodeContents.nodeId, nodeIds));
  },

  async deleteByIndexVersionId(indexVersionId: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx
      .delete(documentNodeContents)
      .where(eq(documentNodeContents.indexVersionId, indexVersionId));
  },
};
