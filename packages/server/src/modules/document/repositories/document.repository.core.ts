import { and, asc, count, desc, eq, gt, isNotNull, isNull, like, lt, or, sql } from 'drizzle-orm';
import type { DocumentListParams, TrashListParams } from '@groundpath/shared/types';
import { db } from '@core/db';
import { getDbContext, now, type Transaction } from '@core/db/db.utils';
import { AppError } from '@core/errors/app-error';
import { Errors } from '@core/errors';
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

type DocumentSortBy = DocumentListParams['sortBy'];
type TrashSortBy = TrashListParams['sortBy'];
type SortOrder = 'asc' | 'desc';
type CursorValue = string | number | Date;

interface CursorPayload<TSortBy extends string> {
  id: string;
  sortBy: TSortBy;
  sortOrder: SortOrder;
  value: string | number;
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

function buildStableDocumentOrder(
  sortColumn:
    | typeof documents.createdAt
    | typeof documents.updatedAt
    | typeof documents.title
    | typeof documents.fileSize,
  sortOrder: 'asc' | 'desc'
) {
  const orderByFn = sortOrder === 'asc' ? asc : desc;
  return [orderByFn(sortColumn), orderByFn(documents.id)] as const;
}

function buildStableTrashOrder(
  sortColumn: typeof documents.deletedAt | typeof documents.title | typeof documents.fileSize,
  sortOrder: 'asc' | 'desc'
) {
  const orderByFn = sortOrder === 'asc' ? asc : desc;
  return [orderByFn(sortColumn), orderByFn(documents.id)] as const;
}

function encodeCursor<TSortBy extends string>(payload: CursorPayload<TSortBy>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function invalidCursorError() {
  return Errors.validation('Invalid pagination cursor');
}

function decodeCursor<TSortBy extends string>(
  cursor: string,
  expectedSortBy: TSortBy,
  expectedSortOrder: SortOrder
): CursorPayload<TSortBy> {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as CursorPayload<TSortBy>;
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof decoded.id !== 'string' ||
      decoded.id.length === 0 ||
      decoded.sortBy !== expectedSortBy ||
      decoded.sortOrder !== expectedSortOrder ||
      (typeof decoded.value !== 'string' && typeof decoded.value !== 'number')
    ) {
      throw invalidCursorError();
    }
    return decoded;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw invalidCursorError();
  }
}

function parseDocumentCursorValue(sortBy: DocumentSortBy, value: string | number): CursorValue {
  switch (sortBy) {
    case 'fileSize':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw invalidCursorError();
      }
      return value;
    case 'createdAt':
    case 'updatedAt': {
      if (typeof value !== 'string') {
        throw invalidCursorError();
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw invalidCursorError();
      }
      return parsed;
    }
    case 'title':
      if (typeof value !== 'string') {
        throw invalidCursorError();
      }
      return value;
  }
}

function parseTrashCursorValue(sortBy: TrashSortBy, value: string | number): CursorValue {
  if (sortBy === 'fileSize') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw invalidCursorError();
    }
    return value;
  }

  if (typeof value !== 'string') {
    throw invalidCursorError();
  }

  if (sortBy === 'deletedAt') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw invalidCursorError();
    }
    return parsed;
  }

  return value;
}

function getDocumentCursorValue(document: Document, sortBy: DocumentSortBy): string | number {
  switch (sortBy) {
    case 'createdAt':
      return document.createdAt.toISOString();
    case 'updatedAt':
      return document.updatedAt.toISOString();
    case 'title':
      return document.title;
    case 'fileSize':
      return document.fileSize;
  }
}

function getTrashCursorValue(document: Document, sortBy: TrashSortBy): string | number {
  switch (sortBy) {
    case 'deletedAt':
      return document.deletedAt!.toISOString();
    case 'title':
      return document.title;
    case 'fileSize':
      return document.fileSize;
  }
}

function buildCursorCondition(
  column:
    | typeof documents.createdAt
    | typeof documents.updatedAt
    | typeof documents.deletedAt
    | typeof documents.title
    | typeof documents.fileSize,
  cursorValue: CursorValue,
  cursorId: string,
  sortOrder: SortOrder
) {
  const compare = sortOrder === 'asc' ? gt : lt;
  const condition = or(
    compare(column, cursorValue),
    and(eq(column, cursorValue), compare(documents.id, cursorId))
  );
  if (!condition) {
    throw Errors.internal('Failed to build pagination cursor condition');
  }
  return condition;
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
