import { eq, and, isNull, isNotNull, desc, asc, like, sql, count } from 'drizzle-orm';
import { db } from '@shared/db';
import { now } from '@shared/db/utils';
import { documents, type Document, type NewDocument } from '@shared/db/schema/document/documents';
import type { DocumentListParams, TrashListParams } from '@knowledge-agent/shared/types';

/**
 * Document repository for database operations
 */
export const documentRepository = {
  /**
   * Create a new document
   */
  async create(data: NewDocument): Promise<Document> {
    await db.insert(documents).values(data);
    const result = await db.select().from(documents).where(eq(documents.id, data.id)).limit(1);
    return result[0]!;
  },

  /**
   * Find document by ID (non-deleted only)
   */
  async findById(id: string): Promise<Document | undefined> {
    const result = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
      .limit(1);
    return result[0];
  },

  /**
   * Find document by ID and user (for ownership check)
   */
  async findByIdAndUser(id: string, userId: string): Promise<Document | undefined> {
    const result = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId), isNull(documents.deletedAt)))
      .limit(1);
    return result[0];
  },

  /**
   * List documents with pagination and filtering
   */
  async list(
    userId: string,
    params: DocumentListParams
  ): Promise<{ documents: Document[]; total: number }> {
    const { page, pageSize, folderId, documentType, search, sortBy, sortOrder } = params;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [eq(documents.userId, userId), isNull(documents.deletedAt)];

    if (folderId === null) {
      conditions.push(isNull(documents.folderId));
    } else if (folderId) {
      conditions.push(eq(documents.folderId, folderId));
    }

    if (documentType) {
      conditions.push(eq(documents.documentType, documentType));
    }

    if (search) {
      conditions.push(like(documents.title, `%${search}%`));
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await db.select({ count: count() }).from(documents).where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by
    const orderByColumn = {
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      title: documents.title,
      fileSize: documents.fileSize,
    }[sortBy];

    const orderByFn = sortOrder === 'asc' ? asc : desc;

    // Get documents
    const result = await db
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(orderByFn(orderByColumn))
      .limit(pageSize)
      .offset(offset);

    return { documents: result, total };
  },

  /**
   * Update document
   */
  async update(
    id: string,
    data: Partial<
      Pick<
        Document,
        | 'title'
        | 'description'
        | 'folderId'
        | 'currentVersion'
        | 'fileName'
        | 'mimeType'
        | 'fileSize'
        | 'fileExtension'
        | 'documentType'
        | 'processingStatus'
        | 'processingError'
        | 'chunkCount'
        | 'updatedBy'
      >
    >
  ): Promise<Document | undefined> {
    await db.update(documents).set(data).where(eq(documents.id, id));
    return this.findById(id);
  },

  /**
   * Soft delete document
   */
  async softDelete(id: string, deletedBy: string): Promise<void> {
    await db
      .update(documents)
      .set({
        deletedAt: now(),
        deletedBy,
      })
      .where(eq(documents.id, id));
  },

  /**
   * Count documents in a folder
   */
  async countByFolderId(folderId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(documents)
      .where(and(eq(documents.folderId, folderId), isNull(documents.deletedAt)));
    return result[0]?.count ?? 0;
  },

  /**
   * Move documents to another folder (or root)
   */
  async moveToFolder(
    documentIds: string[],
    folderId: string | null,
    userId: string
  ): Promise<void> {
    if (documentIds.length === 0) return;

    await db
      .update(documents)
      .set({ folderId })
      .where(
        and(
          sql`${documents.id} IN (${sql.join(
            documentIds.map((id) => sql`${id}`),
            sql`, `
          )})`,
          eq(documents.userId, userId),
          isNull(documents.deletedAt)
        )
      );
  },

  /**
   * Move all documents from one folder to root
   */
  async moveAllFromFolderToRoot(folderId: string, userId: string): Promise<void> {
    await db
      .update(documents)
      .set({ folderId: null })
      .where(
        and(
          eq(documents.folderId, folderId),
          eq(documents.userId, userId),
          isNull(documents.deletedAt)
        )
      );
  },

  /**
   * Find deleted document by ID and user (for trash operations)
   */
  async findDeletedByIdAndUser(id: string, userId: string): Promise<Document | undefined> {
    const result = await db
      .select()
      .from(documents)
      .where(
        and(eq(documents.id, id), eq(documents.userId, userId), isNotNull(documents.deletedAt))
      )
      .limit(1);
    return result[0];
  },

  /**
   * List deleted documents (trash) with pagination
   */
  async listDeleted(
    userId: string,
    params: TrashListParams
  ): Promise<{ documents: Document[]; total: number }> {
    const { page, pageSize, search, sortBy, sortOrder } = params;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [eq(documents.userId, userId), isNotNull(documents.deletedAt)];

    if (search) {
      conditions.push(like(documents.title, `%${search}%`));
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await db.select({ count: count() }).from(documents).where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Build order by
    const orderByColumn = {
      deletedAt: documents.deletedAt,
      title: documents.title,
      fileSize: documents.fileSize,
    }[sortBy];

    const orderByFn = sortOrder === 'asc' ? asc : desc;

    // Get documents
    const result = await db
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(orderByFn(orderByColumn))
      .limit(pageSize)
      .offset(offset);

    return { documents: result, total };
  },

  /**
   * Restore a soft-deleted document
   */
  async restore(id: string): Promise<Document | undefined> {
    await db
      .update(documents)
      .set({
        deletedAt: null,
        deletedBy: null,
      })
      .where(eq(documents.id, id));
    return this.findById(id);
  },

  /**
   * Hard delete document (permanent)
   */
  async hardDelete(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  },

  /**
   * Update processing status
   */
  async updateProcessingStatus(
    id: string,
    status: Document['processingStatus'],
    error?: string,
    chunkCount?: number
  ): Promise<void> {
    const updateData: Partial<Document> = { processingStatus: status };
    if (error !== undefined) {
      updateData.processingError = error;
    }
    if (chunkCount !== undefined) {
      updateData.chunkCount = chunkCount;
    }
    await db.update(documents).set(updateData).where(eq(documents.id, id));
  },
};
