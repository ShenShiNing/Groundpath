import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@core/db';
import { getDbContext, type Transaction } from '@core/db/db.utils';
import {
  documentEdges,
  type DocumentEdge,
  type NewDocumentEdge,
} from '@core/db/schema/document/document-edges.schema';

export const documentEdgeRepository = {
  async createMany(data: NewDocumentEdge[], tx?: Transaction): Promise<void> {
    if (data.length === 0) return;
    const ctx = getDbContext(tx);
    await ctx.insert(documentEdges).values(data);
  },

  async listByIndexVersionId(indexVersionId: string): Promise<DocumentEdge[]> {
    return db.select().from(documentEdges).where(eq(documentEdges.indexVersionId, indexVersionId));
  },

  async listByFromNodeIds(fromNodeIds: string[]): Promise<DocumentEdge[]> {
    if (fromNodeIds.length === 0) return [];
    return db.select().from(documentEdges).where(inArray(documentEdges.fromNodeId, fromNodeIds));
  },

  async listByIndexVersionAndFromNodeIds(
    indexVersionId: string,
    fromNodeIds: string[],
    edgeTypes?: DocumentEdge['edgeType'][]
  ): Promise<DocumentEdge[]> {
    if (fromNodeIds.length === 0) return [];

    const conditions = [
      eq(documentEdges.indexVersionId, indexVersionId),
      inArray(documentEdges.fromNodeId, fromNodeIds),
    ];

    if (edgeTypes?.length) {
      conditions.push(inArray(documentEdges.edgeType, edgeTypes));
    }

    return db
      .select()
      .from(documentEdges)
      .where(and(...conditions));
  },

  async deleteByIndexVersionId(indexVersionId: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.delete(documentEdges).where(eq(documentEdges.indexVersionId, indexVersionId));
  },
};
