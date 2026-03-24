import { and, asc, count, eq, isNotNull, isNull, like, sql } from 'drizzle-orm';
import type { DocumentListParams, TrashListParams } from '@groundpath/shared/types';
import { db } from '@core/db';
import { getDbContext, now, type Transaction } from '@core/db/db.utils';
import {
  documents,
  type Document,
  type NewDocument,
} from '@core/db/schema/document/documents.schema';
import type { DocumentUpdateInput } from './document.repository.types';
import {
  buildCursorCondition,
  buildDocumentOrderBy,
  buildStableDocumentOrder,
  buildStableTrashOrder,
  buildTrashOrderBy,
  decodeCursor,
  encodeCursor,
  getDocumentCursorValue,
  getTrashCursorValue,
  parseDocumentCursorValue,
  parseTrashCursorValue,
} from './document.repository.cursor';

async function findActiveDocumentById(id: string, tx?: Transaction): Promise<Document | undefined> {
  const ctx = getDbContext(tx);
  const result = await ctx
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
    .limit(1);

  return result[0];
}

type DocumentDeletedState = 'active' | 'deleted' | 'any';

function buildDeletedStateFilter(deletedState: DocumentDeletedState) {
  if (deletedState === 'active') {
    return isNull(documents.deletedAt);
  }

  if (deletedState === 'deleted') {
    return isNotNull(documents.deletedAt);
  }

  return undefined;
}

async function findOwnedDocumentById(
  id: string,
  userId: string,
  deletedState: DocumentDeletedState,
  tx?: Transaction
): Promise<Document | undefined> {
  const ctx = getDbContext(tx);
  const conditions = [eq(documents.id, id), eq(documents.userId, userId)];
  const deletedStateFilter = buildDeletedStateFilter(deletedState);
  if (deletedStateFilter) {
    conditions.push(deletedStateFilter);
  }

  const result = await ctx
    .select()
    .from(documents)
    .where(and(...conditions))
    .limit(1);

  return result[0];
}

function extractRows<T>(result: unknown): T[] {
  return (result as [T[]])[0] ?? [];
}

export const documentRepositoryCore = {
  create: async (data: NewDocument, tx?: Transaction): Promise<Document> => {
    const ctx = getDbContext(tx);
    await ctx.insert(documents).values(data);

    const result = await ctx.select().from(documents).where(eq(documents.id, data.id)).limit(1);
    return result[0]!;
  },

  findById: findActiveDocumentById,

  findByIdAndUser(id: string, userId: string, tx?: Transaction): Promise<Document | undefined> {
    return findOwnedDocumentById(id, userId, 'active', tx);
  },

  findByIdAndUserIncludingDeleted(
    id: string,
    userId: string,
    tx?: Transaction
  ): Promise<Document | undefined> {
    return findOwnedDocumentById(id, userId, 'any', tx);
  },

  async lockByIdAndUser(
    id: string,
    userId: string,
    tx: Transaction
  ): Promise<Document | undefined> {
    const ctx = getDbContext(tx);
    const rows = extractRows<{ id: string }>(
      await ctx.execute(sql`
        SELECT id
        FROM documents
        WHERE id = ${id}
          AND user_id = ${userId}
        LIMIT 1
        FOR UPDATE
      `)
    );

    if (rows.length === 0) {
      return undefined;
    }

    return findOwnedDocumentById(id, userId, 'any', tx);
  },

  async listByKnowledgeBaseId(
    knowledgeBaseId: string,
    options?: { includeDeleted?: boolean },
    tx?: Transaction
  ): Promise<Document[]> {
    const ctx = getDbContext(tx);
    const whereClause = options?.includeDeleted
      ? eq(documents.knowledgeBaseId, knowledgeBaseId)
      : and(eq(documents.knowledgeBaseId, knowledgeBaseId), isNull(documents.deletedAt));

    return ctx
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(asc(documents.createdAt), asc(documents.id));
  },

  async list(
    userId: string,
    params: DocumentListParams
  ): Promise<{
    documents: Document[];
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const { pageSize, cursor, knowledgeBaseId, documentType, search, sortBy, sortOrder } = params;
    const baseConditions = [eq(documents.userId, userId), isNull(documents.deletedAt)];

    if (knowledgeBaseId) {
      baseConditions.push(eq(documents.knowledgeBaseId, knowledgeBaseId));
    }

    if (documentType) {
      baseConditions.push(eq(documents.documentType, documentType));
    }

    if (search) {
      baseConditions.push(like(documents.title, `%${search}%`));
    }

    const countWhereClause = and(...baseConditions);
    const countResult = await db.select({ count: count() }).from(documents).where(countWhereClause);
    const total = countResult[0]?.count ?? 0;
    const sortColumn = buildDocumentOrderBy(sortBy);
    const listConditions = [...baseConditions];

    if (cursor) {
      const decodedCursor = decodeCursor(cursor, sortBy, sortOrder);
      listConditions.push(
        buildCursorCondition(
          sortColumn,
          parseDocumentCursorValue(sortBy, decodedCursor.value),
          decodedCursor.id,
          sortOrder
        )
      );
    }

    const orderBy = buildStableDocumentOrder(buildDocumentOrderBy(sortBy), sortOrder);
    const result = await db
      .select()
      .from(documents)
      .where(and(...listConditions))
      .orderBy(...orderBy)
      .limit(pageSize + 1);

    const hasMore = result.length > pageSize;
    const pageDocuments = hasMore ? result.slice(0, pageSize) : result;
    const lastDocument = pageDocuments.at(-1);
    const nextCursor =
      hasMore && lastDocument
        ? encodeCursor({
            id: lastDocument.id,
            sortBy,
            sortOrder,
            value: getDocumentCursorValue(lastDocument, sortBy),
          })
        : null;

    return { documents: pageDocuments, total, hasMore, nextCursor };
  },

  async update(
    id: string,
    data: DocumentUpdateInput,
    tx?: Transaction
  ): Promise<Document | undefined> {
    const ctx = getDbContext(tx);
    const updateData: Partial<Document> = { ...data };

    if (data.processingStatus !== undefined && data.processingStartedAt === undefined) {
      updateData.processingStartedAt = data.processingStatus === 'processing' ? new Date() : null;
    }

    await ctx.update(documents).set(updateData).where(eq(documents.id, id));
    return findActiveDocumentById(id, tx);
  },

  async softDelete(id: string, deletedBy: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx
      .update(documents)
      .set({
        activeIndexVersionId: null,
        deletedAt: now(),
        deletedBy,
      })
      .where(eq(documents.id, id));
  },

  findDeletedByIdAndUser(
    id: string,
    userId: string,
    tx?: Transaction
  ): Promise<Document | undefined> {
    return findOwnedDocumentById(id, userId, 'deleted', tx);
  },

  async listDeleted(
    userId: string,
    params: TrashListParams
  ): Promise<{
    documents: Document[];
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const { pageSize, cursor, search, sortBy, sortOrder } = params;
    const baseConditions = [eq(documents.userId, userId), isNotNull(documents.deletedAt)];

    if (search) {
      baseConditions.push(like(documents.title, `%${search}%`));
    }

    const countWhereClause = and(...baseConditions);
    const countResult = await db.select({ count: count() }).from(documents).where(countWhereClause);
    const total = countResult[0]?.count ?? 0;
    const sortColumn = buildTrashOrderBy(sortBy);
    const listConditions = [...baseConditions];

    if (cursor) {
      const decodedCursor = decodeCursor(cursor, sortBy, sortOrder);
      listConditions.push(
        buildCursorCondition(
          sortColumn,
          parseTrashCursorValue(sortBy, decodedCursor.value),
          decodedCursor.id,
          sortOrder
        )
      );
    }

    const orderBy = buildStableTrashOrder(buildTrashOrderBy(sortBy), sortOrder);
    const result = await db
      .select()
      .from(documents)
      .where(and(...listConditions))
      .orderBy(...orderBy)
      .limit(pageSize + 1);

    const hasMore = result.length > pageSize;
    const pageDocuments = hasMore ? result.slice(0, pageSize) : result;
    const lastDocument = pageDocuments.at(-1);
    const nextCursor =
      hasMore && lastDocument
        ? encodeCursor({
            id: lastDocument.id,
            sortBy,
            sortOrder,
            value: getTrashCursorValue(lastDocument, sortBy),
          })
        : null;

    return { documents: pageDocuments, total, hasMore, nextCursor };
  },

  async listDeletedIds(userId: string): Promise<string[]> {
    const result = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.userId, userId), isNotNull(documents.deletedAt)));

    return result.map((row) => row.id);
  },

  async restore(id: string, tx?: Transaction): Promise<Document | undefined> {
    const ctx = getDbContext(tx);
    await ctx
      .update(documents)
      .set({
        activeIndexVersionId: null,
        deletedAt: null,
        deletedBy: null,
      })
      .where(eq(documents.id, id));

    return findActiveDocumentById(id, tx);
  },

  async hardDelete(id: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.delete(documents).where(eq(documents.id, id));
  },

  async hardDeleteByKnowledgeBaseId(knowledgeBaseId: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx.delete(documents).where(eq(documents.knowledgeBaseId, knowledgeBaseId));
  },
};
