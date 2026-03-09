import { eq, and, isNull, isNotNull, desc, asc, like, sql, count } from 'drizzle-orm';
import { db } from '@shared/db';
import { now, getDbContext, type Transaction } from '@shared/db/db.utils';
import {
  documents,
  type Document,
  type NewDocument,
} from '@shared/db/schema/document/documents.schema';
import type { DocumentListParams, TrashListParams } from '@knowledge-agent/shared/types';

/**
 * Document repository for database operations
 */
export const documentRepository = {
  /**
   * Create a new document
   */
  async create(data: NewDocument, tx?: Transaction): Promise<Document> {
    const ctx = getDbContext(tx);
    await ctx.insert(documents).values(data);
    const result = await ctx.select().from(documents).where(eq(documents.id, data.id)).limit(1);
    return result[0]!;
  },

  /**
   * Find document by ID (non-deleted only)
   */
  async findById(id: string, tx?: Transaction): Promise<Document | undefined> {
    const ctx = getDbContext(tx);
    const result = await ctx
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
    const { page, pageSize, knowledgeBaseId, documentType, search, sortBy, sortOrder } = params;
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [eq(documents.userId, userId), isNull(documents.deletedAt)];

    if (knowledgeBaseId) {
      conditions.push(eq(documents.knowledgeBaseId, knowledgeBaseId));
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
        | 'currentVersion'
        | 'fileName'
        | 'mimeType'
        | 'fileSize'
        | 'fileExtension'
        | 'documentType'
        | 'activeIndexVersionId'
        | 'processingStatus'
        | 'processingError'
        | 'chunkCount'
        | 'updatedBy'
      >
    >,
    tx?: Transaction
  ): Promise<Document | undefined> {
    const ctx = getDbContext(tx);
    await ctx.update(documents).set(data).where(eq(documents.id, id));
    return this.findById(id, tx);
  },

  /**
   * Soft delete document
   */
  async softDelete(id: string, deletedBy: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx
      .update(documents)
      .set({
        deletedAt: now(),
        deletedBy,
      })
      .where(eq(documents.id, id));
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
   * List all deleted document IDs for a user (for bulk trash cleanup)
   */
  async listDeletedIds(userId: string): Promise<string[]> {
    const result = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.userId, userId), isNotNull(documents.deletedAt)));

    return result.map((row) => row.id);
  },

  /**
   * Restore a soft-deleted document
   */
  async restore(id: string, tx?: Transaction): Promise<Document | undefined> {
    const ctx = getDbContext(tx);
    await ctx
      .update(documents)
      .set({
        deletedAt: null,
        deletedBy: null,
      })
      .where(eq(documents.id, id));
    return this.findById(id, tx);
  },

  /**
   * Hard delete document (permanent)
   */
  async hardDelete(id: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.delete(documents).where(eq(documents.id, id));
  },

  /**
   * Update processing status
   */
  async updateProcessingStatus(
    id: string,
    status: Document['processingStatus'],
    error?: string | null,
    chunkCount?: number,
    tx?: Transaction
  ): Promise<void> {
    const ctx = getDbContext(tx);
    const updateData: Partial<Document> = { processingStatus: status };
    if (error !== undefined) {
      updateData.processingError = error;
    }
    if (chunkCount !== undefined) {
      updateData.chunkCount = chunkCount;
    }
    await ctx.update(documents).set(updateData).where(eq(documents.id, id));
  },

  /**
   * Count active documents in a knowledge base
   */
  async countByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(documents)
      .where(and(eq(documents.knowledgeBaseId, knowledgeBaseId), isNull(documents.deletedAt)));
    return result[0]?.count ?? 0;
  },

  /**
   * Sum chunk counts of active documents in a knowledge base
   */
  async sumChunksByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${documents.chunkCount}), 0)` })
      .from(documents)
      .where(and(eq(documents.knowledgeBaseId, knowledgeBaseId), isNull(documents.deletedAt)));
    return result[0]?.total ?? 0;
  },

  /**
   * Get id -> title map for multiple documents in a single query.
   * Used to batch-enrich search results and avoid N+1 lookups.
   */
  async getTitlesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const result = await db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(
        and(
          sql`${documents.id} IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `
          )})`,
          isNull(documents.deletedAt)
        )
      );
    return new Map(result.map((r) => [r.id, r.title]));
  },
};
