import { and, asc, count, desc, eq, isNotNull, isNull, like, sql } from 'drizzle-orm';
import type { DocumentListParams, TrashListParams } from '@groundpath/shared/types';
import { db } from '@core/db';
import { getDbContext, now, type Transaction } from '@core/db/db.utils';
import {
  documents,
  type Document,
  type NewDocument,
} from '@core/db/schema/document/documents.schema';
import type { DocumentUpdateInput } from './document.repository.types';

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

function buildDocumentOrderBy(sortBy: DocumentListParams['sortBy']) {
  return {
    createdAt: documents.createdAt,
    updatedAt: documents.updatedAt,
    title: documents.title,
    fileSize: documents.fileSize,
  }[sortBy];
}

function buildTrashOrderBy(sortBy: TrashListParams['sortBy']) {
  return {
    deletedAt: documents.deletedAt,
    title: documents.title,
    fileSize: documents.fileSize,
  }[sortBy];
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
  ): Promise<{ documents: Document[]; total: number }> {
    const { page, pageSize, knowledgeBaseId, documentType, search, sortBy, sortOrder } = params;
    const offset = (page - 1) * pageSize;
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
    const countResult = await db.select({ count: count() }).from(documents).where(whereClause);
    const total = countResult[0]?.count ?? 0;
    const orderByFn = sortOrder === 'asc' ? asc : desc;
    const result = await db
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(orderByFn(buildDocumentOrderBy(sortBy)))
      .limit(pageSize)
      .offset(offset);

    return { documents: result, total };
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
  ): Promise<{ documents: Document[]; total: number }> {
    const { page, pageSize, search, sortBy, sortOrder } = params;
    const offset = (page - 1) * pageSize;
    const conditions = [eq(documents.userId, userId), isNotNull(documents.deletedAt)];

    if (search) {
      conditions.push(like(documents.title, `%${search}%`));
    }

    const whereClause = and(...conditions);
    const countResult = await db.select({ count: count() }).from(documents).where(whereClause);
    const total = countResult[0]?.count ?? 0;
    const orderByFn = sortOrder === 'asc' ? asc : desc;
    const result = await db
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(orderByFn(buildTrashOrderBy(sortBy)))
      .limit(pageSize)
      .offset(offset);

    return { documents: result, total };
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
