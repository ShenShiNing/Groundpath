import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '@shared/db';
import { now } from '@shared/db/db.utils';
import {
  knowledgeBases,
  type KnowledgeBase,
  type NewKnowledgeBase,
} from '@shared/db/schema/document/knowledge-bases.schema';

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
   * List all knowledge bases for a user
   */
  async listByUser(userId: string): Promise<KnowledgeBase[]> {
    return db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.userId, userId), isNull(knowledgeBases.deletedAt)))
      .orderBy(knowledgeBases.createdAt);
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
  async softDelete(id: string, deletedBy: string): Promise<void> {
    await db
      .update(knowledgeBases)
      .set({
        deletedAt: now(),
        deletedBy,
      })
      .where(eq(knowledgeBases.id, id));
  },

  /**
   * Increment document count
   */
  async incrementDocumentCount(id: string, delta: number): Promise<void> {
    await db
      .update(knowledgeBases)
      .set({
        documentCount: sql`${knowledgeBases.documentCount} + ${delta}`,
      })
      .where(eq(knowledgeBases.id, id));
  },

  /**
   * Increment total chunks count
   */
  async incrementTotalChunks(id: string, delta: number): Promise<void> {
    await db
      .update(knowledgeBases)
      .set({
        totalChunks: sql`${knowledgeBases.totalChunks} + ${delta}`,
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
};
