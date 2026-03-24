import { eq, and, isNull, sql, count, desc, lt, or } from 'drizzle-orm';
import { db } from '@core/db';
import { now, getDbContext, type Transaction } from '@core/db/db.utils';
import { AppError } from '@core/errors/app-error';
import { Errors } from '@core/errors';
import {
  knowledgeBases,
  type KnowledgeBase,
  type NewKnowledgeBase,
} from '@core/db/schema/document/knowledge-bases.schema';
import { documents } from '@core/db/schema/document/documents.schema';

function extractRows<T>(result: unknown): T[] {
  return (result as [T[]])[0] ?? [];
}

type SortOrder = 'asc' | 'desc';

interface KnowledgeBaseCursorPayload {
  id: string;
  sortBy: 'createdAt';
  sortOrder: SortOrder;
  value: string;
}

function invalidCursorError() {
  return Errors.validation('Invalid pagination cursor');
}

function encodeCursor(payload: KnowledgeBaseCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { id: string; value: Date } {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as KnowledgeBaseCursorPayload;
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      decoded.sortBy !== 'createdAt' ||
      decoded.sortOrder !== 'desc' ||
      typeof decoded.id !== 'string' ||
      decoded.id.length === 0 ||
      typeof decoded.value !== 'string'
    ) {
      throw invalidCursorError();
    }

    const parsed = new Date(decoded.value);
    if (Number.isNaN(parsed.getTime())) {
      throw invalidCursorError();
    }

    return { id: decoded.id, value: parsed };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw invalidCursorError();
  }
}

function buildCursorCondition(cursor: { id: string; value: Date }) {
  const condition = or(
    lt(knowledgeBases.createdAt, cursor.value),
    and(eq(knowledgeBases.createdAt, cursor.value), lt(knowledgeBases.id, cursor.id))
  );
  if (!condition) {
    throw Errors.internal('Failed to build pagination cursor condition');
  }
  return condition;
}

/**
 * Knowledge base repository for database operations
 */
export const knowledgeBaseRepository = {
  /**
   * Create a new knowledge base
   */
  async create(data: NewKnowledgeBase): Promise<KnowledgeBase> {
    await db.insert(knowledgeBases).values(data);
    const result = await db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, data.id))
      .limit(1);
    return result[0]!;
  },

  /**
   * Find knowledge base by ID (non-deleted only)
   */
  async findById(id: string): Promise<KnowledgeBase | undefined> {
    const result = await db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, id), isNull(knowledgeBases.deletedAt)))
      .limit(1);
    return result[0];
  },

  /**
   * Find knowledge base by ID and user (for ownership check)
   */
  async findByIdAndUser(id: string, userId: string): Promise<KnowledgeBase | undefined> {
    const result = await db
      .select()
      .from(knowledgeBases)
      .where(
        and(
          eq(knowledgeBases.id, id),
          eq(knowledgeBases.userId, userId),
          isNull(knowledgeBases.deletedAt)
        )
      )
      .limit(1);
    return result[0];
  },

  /**
   * Lock an active knowledge base row within an existing transaction.
   */
  async lockByIdAndUser(id: string, userId: string, tx: Transaction): Promise<boolean> {
    const ctx = getDbContext(tx);
    const rows = extractRows<{ id: string }>(
      await ctx.execute(sql`
      SELECT id
      FROM knowledge_bases
      WHERE id = ${id}
        AND user_id = ${userId}
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `)
    );

    return rows.length > 0;
  },

  /**
   * List all knowledge bases for a user (paginated)
   */
  async listByUser(
    userId: string,
    options?: { pageSize?: number; cursor?: string }
  ): Promise<{ knowledgeBases: KnowledgeBase[]; hasMore: boolean; nextCursor: string | null }> {
    const pageSize = options?.pageSize ?? 20;
    const conditions = [eq(knowledgeBases.userId, userId), isNull(knowledgeBases.deletedAt)];

    if (options?.cursor) {
      conditions.push(buildCursorCondition(decodeCursor(options.cursor)));
    }

    const rows = await db
      .select()
      .from(knowledgeBases)
      .where(and(...conditions))
      .orderBy(desc(knowledgeBases.createdAt), desc(knowledgeBases.id))
      .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const lastKnowledgeBase = pageRows.at(-1);
    const nextCursor =
      hasMore && lastKnowledgeBase
        ? encodeCursor({
            id: lastKnowledgeBase.id,
            sortBy: 'createdAt',
            sortOrder: 'desc',
            value: lastKnowledgeBase.createdAt.toISOString(),
          })
        : null;

    return {
      knowledgeBases: pageRows,
      hasMore,
      nextCursor,
    };
  },

  async listAllByUser(userId: string): Promise<KnowledgeBase[]> {
    return db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.userId, userId), isNull(knowledgeBases.deletedAt)))
      .orderBy(desc(knowledgeBases.createdAt), desc(knowledgeBases.id));
  },

  /**
   * Count knowledge bases for a user
   */
  async countByUser(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.userId, userId), isNull(knowledgeBases.deletedAt)));
    return result[0]?.count ?? 0;
  },

  /**
   * Update knowledge base
   */
  async update(
    id: string,
    data: Partial<Pick<KnowledgeBase, 'name' | 'description' | 'updatedBy'>>
  ): Promise<KnowledgeBase | undefined> {
    await db.update(knowledgeBases).set(data).where(eq(knowledgeBases.id, id));
    return this.findById(id);
  },

  /**
   * Soft delete knowledge base
   */
  async softDelete(id: string, deletedBy: string, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx
      .update(knowledgeBases)
      .set({
        deletedAt: now(),
        deletedBy,
      })
      .where(eq(knowledgeBases.id, id));
  },

  /**
   * Increment document count (with floor at 0)
   */
  async incrementDocumentCount(id: string, delta: number, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx
      .update(knowledgeBases)
      .set({
        documentCount: sql`GREATEST(${knowledgeBases.documentCount} + ${delta}, 0)`,
      })
      .where(eq(knowledgeBases.id, id));
  },

  /**
   * Increment total chunks count (with floor at 0)
   */
  async incrementTotalChunks(id: string, delta: number, tx?: Transaction): Promise<void> {
    const ctx = getDbContext(tx);
    await ctx
      .update(knowledgeBases)
      .set({
        totalChunks: sql`GREATEST(${knowledgeBases.totalChunks} + ${delta}, 0)`,
      })
      .where(eq(knowledgeBases.id, id));
  },

  /**
   * Update counters (atomically reset and set)
   */
  async updateCounters(
    id: string,
    counters: { documentCount?: number; totalChunks?: number }
  ): Promise<void> {
    await db
      .update(knowledgeBases)
      .set({
        ...(counters.documentCount !== undefined && { documentCount: counters.documentCount }),
        ...(counters.totalChunks !== undefined && { totalChunks: counters.totalChunks }),
      })
      .where(eq(knowledgeBases.id, id));
  },

  /**
   * List all knowledge bases (for admin operations like counter sync)
   */
  async listAll(): Promise<KnowledgeBase[]> {
    return db.select().from(knowledgeBases).where(isNull(knowledgeBases.deletedAt));
  },

  /**
   * Count active (non-deleted) documents belonging to a knowledge base.
   * Used by counter-sync to avoid cross-module dependency on the document repository.
   */
  async countDocumentsByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(documents)
      .where(and(eq(documents.knowledgeBaseId, knowledgeBaseId), isNull(documents.deletedAt)));
    return result[0]?.count ?? 0;
  },

  /**
   * Sum chunk counts for active documents belonging to a knowledge base.
   * Used by counter-sync to avoid cross-module dependency on the document repository.
   */
  async sumDocumentChunksByKnowledgeBaseId(knowledgeBaseId: string): Promise<number> {
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${documents.chunkCount}), 0)` })
      .from(documents)
      .where(and(eq(documents.knowledgeBaseId, knowledgeBaseId), isNull(documents.deletedAt)));
    return result[0]?.total ?? 0;
  },
};
