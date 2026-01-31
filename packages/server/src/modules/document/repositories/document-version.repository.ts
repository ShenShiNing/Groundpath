import { eq, and, desc } from 'drizzle-orm';
import { db } from '@shared/db';
import {
  documentVersions,
  type DocumentVersion,
  type NewDocumentVersion,
} from '@shared/db/schema/document/document-versions.schema';

/**
 * Document version repository for database operations
 */
export const documentVersionRepository = {
  /**
   * Create a new version record
   */
  async create(data: NewDocumentVersion): Promise<DocumentVersion> {
    await db.insert(documentVersions).values(data);
    const result = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, data.id))
      .limit(1);
    return result[0]!;
  },

  /**
   * Get all versions for a document (ordered by version desc)
   */
  async listByDocumentId(documentId: string): Promise<DocumentVersion[]> {
    return db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.version));
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
  async deleteByDocumentId(documentId: string): Promise<void> {
    await db.delete(documentVersions).where(eq(documentVersions.documentId, documentId));
  },
};
