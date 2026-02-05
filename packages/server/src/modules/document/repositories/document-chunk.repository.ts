import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '@shared/db';
import { getDbContext, type Transaction } from '@shared/db/db.utils';
import {
  documentChunks,
  type DocumentChunk,
  type NewDocumentChunk,
} from '@shared/db/schema/document/document-chunks.schema';

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
    return db
      .select()
      .from(documentChunks)
      .where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.version, version)))
      .orderBy(documentChunks.chunkIndex);
  },

  /**
   * Get all chunks for the latest version of a document
   */
  async listByDocument(documentId: string): Promise<DocumentChunk[]> {
    // Get the latest version first
    const latestChunk = await db
      .select({ version: documentChunks.version })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
      .orderBy(desc(documentChunks.version))
      .limit(1);

    if (latestChunk.length === 0) return [];

    return this.listByDocumentAndVersion(documentId, latestChunk[0]!.version);
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
    const result = await db
      .select()
      .from(documentChunks)
      .where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.version, version)));
    return result.length;
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

  /**
   * Delete chunks by their IDs
   */
  async deleteByIds(ids: string[], tx?: Transaction): Promise<void> {
    if (ids.length === 0) return;
    const ctx = getDbContext(tx);
    await ctx.delete(documentChunks).where(inArray(documentChunks.id, ids));
  },
};
