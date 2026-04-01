import { eq, and, desc, inArray, count } from 'drizzle-orm';
import { db } from '@core/db';
import { getDbContext, type Transaction } from '@core/db/db.utils';
import {
  documentChunks,
  type DocumentChunk,
  type NewDocumentChunk,
} from '@core/db/schema/document/document-chunks.schema';
import { documentIndexVersions } from '@core/db/schema/document/document-index-versions.schema';
import { documents } from '@core/db/schema/document/documents.schema';

async function getLatestIndexVersionIdForDocumentVersion(
  documentId: string,
  version: number
): Promise<string | null> {
  const latestBuild = await db
    .select({ indexVersionId: documentIndexVersions.id })
    .from(documentIndexVersions)
    .where(
      and(
        eq(documentIndexVersions.documentId, documentId),
        eq(documentIndexVersions.documentVersion, version)
      )
    )
    .orderBy(desc(documentIndexVersions.builtAt))
    .limit(1);

  return latestBuild[0]?.indexVersionId ?? null;
}

/**
 * Document chunk repository for RAG operations
 */
export const documentChunkRepository = {
  /**
   * Create a new chunk
   */
  async create(data: NewDocumentChunk): Promise<DocumentChunk> {
    await db.insert(documentChunks).values(data);
    const result = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.id, data.id))
      .limit(1);
    return result[0]!;
  },

  /**
   * Create multiple chunks at once
   */
  async createMany(data: NewDocumentChunk[], tx?: Transaction): Promise<void> {
    if (data.length === 0) return;
    const ctx = getDbContext(tx);
    await ctx.insert(documentChunks).values(data);
  },

  /**
   * Get all chunks for a document version (ordered by chunk index)
   */
  async listByDocumentAndVersion(documentId: string, version: number): Promise<DocumentChunk[]> {
    const latestIndexVersionId = await getLatestIndexVersionIdForDocumentVersion(documentId, version);
    if (!latestIndexVersionId) {
      return [];
    }

    return db
      .select()
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.version, version),
          eq(documentChunks.indexVersionId, latestIndexVersionId)
        )
      )
      .orderBy(documentChunks.chunkIndex);
  },

  /**
   * Get all chunks for the latest version of a document
   */
  async listByDocument(documentId: string): Promise<DocumentChunk[]> {
    const activeDocument = await db
      .select({ activeIndexVersionId: documents.activeIndexVersionId })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    const activeIndexVersionId = activeDocument[0]?.activeIndexVersionId;
    if (!activeIndexVersionId) return [];

    return db
      .select()
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.indexVersionId, activeIndexVersionId)
        )
      )
      .orderBy(documentChunks.chunkIndex);
  },

  /**
   * Delete all chunks for a document version
   */
  async deleteByDocumentAndVersion(documentId: string, version: number): Promise<void> {
    await db
      .delete(documentChunks)
      .where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.version, version)));
  },

  /**
   * Delete all chunks for a document
   */
  async deleteByDocumentId(documentId: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
  },

  /**
   * Count chunks for a document version
   */
  async countByDocumentAndVersion(documentId: string, version: number): Promise<number> {
    const latestIndexVersionId = await getLatestIndexVersionIdForDocumentVersion(documentId, version);
    if (!latestIndexVersionId) {
      return 0;
    }

    const result = await db
      .select({ count: count() })
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.version, version),
          eq(documentChunks.indexVersionId, latestIndexVersionId)
        )
      );

    return result[0]?.count ?? 0;
  },

  /**
   * Get all chunk IDs for a document (for cleanup purposes)
   */
  async getChunkIdsByDocumentId(documentId: string): Promise<string[]> {
    const result = await db
      .select({ id: documentChunks.id })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId));
    return result.map((r) => r.id);
  },

  async countByActiveIndexVersion(documentId: string, indexVersionId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.indexVersionId, indexVersionId)
        )
      );
    return result[0]?.count ?? 0;
  },

  async countByIndexVersionId(indexVersionId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(documentChunks)
      .where(eq(documentChunks.indexVersionId, indexVersionId));
    return result[0]?.count ?? 0;
  },

  /**
   * Delete chunks by their IDs
   */
  async deleteByIds(ids: string[], tx?: Transaction): Promise<void> {
    if (ids.length === 0) return;
    const ctx = getDbContext(tx);
    await ctx.delete(documentChunks).where(inArray(documentChunks.id, ids));
  },
};
