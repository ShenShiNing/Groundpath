import { and, asc, count, desc, eq, isNotNull, isNull, like } from 'drizzle-orm';
import type { DocumentListParams, TrashListParams } from '@knowledge-agent/shared/types';
import { db } from '@shared/db';
import { getDbContext, now, type Transaction } from '@shared/db/db.utils';
import {
  documents,
  type Document,
  type NewDocument,
} from '@shared/db/schema/document/documents.schema';
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

  async findByIdAndUser(id: string, userId: string): Promise<Document | undefined> {
    const result = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId), isNull(documents.deletedAt)))
      .limit(1);

    return result[0];
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
        deletedAt: now(),
        deletedBy,
      })
      .where(eq(documents.id, id));
  },

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
};
