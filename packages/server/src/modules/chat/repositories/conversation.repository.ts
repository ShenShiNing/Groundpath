import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { db } from '@core/db';
import { now } from '@core/db/db.utils';
import {
  conversations,
  type Conversation,
  type NewConversation,
} from '@core/db/schema/ai/conversations.schema';

export const conversationRepository = {
  /**
   * Create a new conversation
   */
  async create(data: NewConversation): Promise<Conversation> {
    await db.insert(conversations).values(data);
    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, data.id))
      .limit(1);
    return result[0]!;
  },

  /**
   * Find conversation by ID (non-deleted only)
   */
  async findById(id: string): Promise<Conversation | undefined> {
    const result = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), isNull(conversations.deletedAt)))
      .limit(1);
    return result[0];
  },

  /**
   * Find conversation by ID and user (for ownership check)
   */
  async findByIdAndUser(id: string, userId: string): Promise<Conversation | undefined> {
    const result = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt)
        )
      )
      .limit(1);
    return result[0];
  },

  /**
   * List conversations for a user with optional KB filter
   */
  async listByUser(
    userId: string,
    options?: {
      knowledgeBaseId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Conversation[]> {
    const conditions = [eq(conversations.userId, userId), isNull(conversations.deletedAt)];

    if (options?.knowledgeBaseId) {
      conditions.push(eq(conversations.knowledgeBaseId, options.knowledgeBaseId));
    }

    return db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.updatedAt))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  },

  /**
   * Update conversation
   */
  async update(
    id: string,
    data: Partial<Pick<Conversation, 'title' | 'knowledgeBaseId' | 'updatedBy'>>
  ): Promise<Conversation | undefined> {
    await db.update(conversations).set(data).where(eq(conversations.id, id));
    return this.findById(id);
  },

  /**
   * Touch updated timestamp
   */
  async touch(id: string, userId: string): Promise<void> {
    await db.update(conversations).set({ updatedBy: userId }).where(eq(conversations.id, id));
  },

  /**
   * Soft delete conversation
   */
  async softDelete(id: string, deletedBy: string): Promise<void> {
    await db
      .update(conversations)
      .set({
        deletedAt: now(),
        deletedBy,
      })
      .where(eq(conversations.id, id));
  },

  /**
   * Count conversations for a user
   */
  async countByUser(userId: string, knowledgeBaseId?: string): Promise<number> {
    const conditions = [eq(conversations.userId, userId), isNull(conversations.deletedAt)];

    if (knowledgeBaseId) {
      conditions.push(eq(conversations.knowledgeBaseId, knowledgeBaseId));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(and(...conditions));

    return result[0]?.count ?? 0;
  },
};
