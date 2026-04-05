import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '@core/db';
import { getDbContext, type Transaction } from '@core/db/db.utils';
import {
  documentVersions,
  type DocumentVersion,
  type NewDocumentVersion,
} from '@core/db/schema/document/document-versions.schema';

/**
 * Document version repository for database operations
 */
export const documentVersionRepository = {
  /**
   * Create a new version record
   */
  async create(data: NewDocumentVersion, tx?: Transaction): Promise<DocumentVersion> {
    const ctx = getDbContext(tx);
    await ctx.insert(documentVersions).values(data);
    const result = await ctx
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, data.id))
      .limit(1);
    return result[0]!;
  },

  /**
   * Get all versions for a document (ordered by version desc)
   */
  async listByDocumentId(documentId: string, tx?: Transaction): Promise<DocumentVersion[]> {
    const ctx = getDbContext(tx);
    return ctx
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.version));
  },

  async listByDocumentIds(documentIds: string[], tx?: Transaction): Promise<DocumentVersion[]> {
    if (documentIds.length === 0) {
      return [];
    }

    const ctx = getDbContext(tx);
    return ctx
      .select()
      .from(documentVersions)
      .where(inArray(documentVersions.documentId, documentIds))
      .orderBy(desc(documentVersions.version), desc(documentVersions.createdAt));
  },

  /**
   * Get a specific version
   */
  async findById(id: string): Promise<DocumentVersion | undefined> {
    const result = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, id))
      .limit(1);
    return result[0];
  },

  /**
   * Get a specific version by document ID and version number
   */
  async findByDocumentAndVersion(
    documentId: string,
    version: number
  ): Promise<DocumentVersion | undefined> {
    const result = await db
      .select()
      .from(documentVersions)
      .where(
        and(eq(documentVersions.documentId, documentId), eq(documentVersions.version, version))
      )
      .limit(1);
    return result[0];
  },

  /**
   * Delete all versions of a document
   */
  async deleteByDocumentId(documentId: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.delete(documentVersions).where(eq(documentVersions.documentId, documentId));
  },
};
