import { eq, asc, desc, sql } from 'drizzle-orm';
import { db } from '@shared/db';
import { messages, type Message, type NewMessage } from '@shared/db/schema/ai/messages.schema';

export const messageRepository = {
  /**
   * Create a new message
   */
  async create(data: NewMessage): Promise<Message> {
    await db.insert(messages).values(data);
    const result = await db.select().from(messages).where(eq(messages.id, data.id)).limit(1);
    return result[0]!;
  },

  /**
   * Find message by ID
   */
  async findById(id: string): Promise<Message | undefined> {
    const result = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return result[0];
  },

  /**
   * List messages for a conversation (ordered by creation time)
   */
  async listByConversation(
    conversationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);
  },

  /**
   * Get recent messages for context (most recent first, then reversed)
   */
  async getRecentMessages(conversationId: string, limit: number = 10): Promise<Message[]> {
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    // Reverse to get chronological order
    return result.reverse();
  },

  /**
   * Count messages in a conversation
   */
  async countByConversation(conversationId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    return result[0]?.count ?? 0;
  },

  /**
   * Get last message timestamp for a conversation
   */
  async getLastMessageAt(conversationId: string): Promise<Date | null> {
    const result = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    return result[0]?.createdAt ?? null;
  },

  /**
   * Delete all messages in a conversation
   */
  async deleteByConversation(conversationId: string): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
  },

  /**
   * Update message metadata
   */
  async updateMetadata(id: string, metadata: Message['metadata']): Promise<void> {
    await db.update(messages).set({ metadata }).where(eq(messages.id, id));
  },

  /**
   * Get message stats (count and last message time) for multiple conversations in one query.
   * Replaces per-conversation countByConversation + getLastMessageAt to avoid N+1.
   */
  async getStatsForConversations(
    conversationIds: string[]
  ): Promise<Map<string, { count: number; lastMessageAt: Date | null }>> {
    if (conversationIds.length === 0) return new Map();

    const result = await db
      .select({
        conversationId: messages.conversationId,
        count: sql<number>`count(*)`,
        lastMessageAt: sql<Date | null>`max(${messages.createdAt})`,
      })
      .from(messages)
      .where(
        sql`${messages.conversationId} IN (${sql.join(
          conversationIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
      .groupBy(messages.conversationId);

    const statsMap = new Map<string, { count: number; lastMessageAt: Date | null }>();
    for (const row of result) {
      statsMap.set(row.conversationId, {
        count: row.count,
        lastMessageAt: row.lastMessageAt,
      });
    }

    // Fill in conversations with no messages
    for (const id of conversationIds) {
      if (!statsMap.has(id)) {
        statsMap.set(id, { count: 0, lastMessageAt: null });
      }
    }

    return statsMap;
  },
};
