import { and, asc, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@core/db';
import { getDbContext, type Transaction } from '@core/db/db.utils';
import { messages, type Message, type NewMessage } from '@core/db/schema/ai/messages.schema';
import { conversations } from '@core/db/schema/ai/conversations.schema';
import type { ConversationSearchItem } from '@groundpath/shared/types';

function buildBooleanSearchQuery(query: string): string {
  const normalized = query.trim();
  if (!normalized) return query;

  // For CJK queries, keep exact phrase (wildcard tends to hurt precision).
  if (/[\u3400-\u9fff]/u.test(normalized)) {
    return normalized
      .replace(/[+\-<>()~*"@]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim().replace(/[+\-<>()~*"@]/g, ''))
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return query;
  return tokens.map((token) => `${token}*`).join(' ');
}

function isMissingFulltextIndexError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const record = error as { message?: unknown; code?: unknown; cause?: unknown };
  const message = typeof record.message === 'string' ? record.message : '';
  const code = typeof record.code === 'string' ? record.code : '';

  if (
    code === 'ER_FT_MATCHING_KEY_NOT_FOUND' ||
    message.includes("Can't find FULLTEXT index matching the column list")
  ) {
    return true;
  }

  return isMissingFulltextIndexError(record.cause);
}

function buildSnippetExpr(query: string) {
  const positionExpr = sql<number>`LOCATE(LOWER(${query}), LOWER(${messages.content}))`;
  const snippetExpr = sql<string>`TRIM(REPLACE(REPLACE(
    CASE
      WHEN ${positionExpr} > 0 THEN SUBSTRING(${messages.content}, GREATEST(1, ${positionExpr} - 40), 220)
      ELSE SUBSTRING(${messages.content}, 1, 220)
    END,
    '\n',
    ' '
  ), '\r', ' '))`;

  return { positionExpr, snippetExpr };
}

export const messageRepository = {
  /**
   * Create a new message
   */
  async create(data: NewMessage, tx?: Transaction): Promise<Message> {
    const ctx = getDbContext(tx);
    await ctx.insert(messages).values(data);
    const result = await ctx.select().from(messages).where(eq(messages.id, data.id)).limit(1);
    return result[0]!;
  },

  /**
   * Create multiple messages and preserve the caller's requested order.
   */
  async createMany(data: NewMessage[], tx?: Transaction): Promise<Message[]> {
    if (data.length === 0) {
      return [];
    }

    const ctx = getDbContext(tx);
    await ctx.insert(messages).values(data);

    const ids = data.map((message) => message.id);
    const result = await ctx.select().from(messages).where(inArray(messages.id, ids));
    const messagesById = new Map(result.map((message) => [message.id, message]));

    return ids
      .map((id) => messagesById.get(id)!)
      .filter((message): message is Message => !!message);
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
   * Update message content
   */
  async updateContent(id: string, content: string): Promise<void> {
    await db.update(messages).set({ content }).where(eq(messages.id, id));
  },

  /**
   * Delete all messages in a conversation created after the given message
   */
  async deleteAfterMessage(conversationId: string, afterMessageId: string): Promise<void> {
    const target = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, afterMessageId))
      .limit(1);

    if (!target[0]) return;

    await db
      .delete(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          gt(messages.createdAt, target[0].createdAt)
        )
      );
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

  /**
   * Search messages by content for a specific user.
   * Uses FULLTEXT search first, then falls back to LIKE for short tokens/CJK.
   */
  async searchByContent(
    userId: string,
    params: {
      query: string;
      knowledgeBaseId?: string;
      limit: number;
      offset: number;
    }
  ): Promise<{ items: ConversationSearchItem[]; total: number }> {
    const { query, knowledgeBaseId, limit, offset } = params;
    const booleanQuery = buildBooleanSearchQuery(query);
    const fulltextScoreExpr = sql<number>`MATCH(${messages.content}) AGAINST (${booleanQuery} IN BOOLEAN MODE)`;
    const { positionExpr: exactPositionExpr, snippetExpr } = buildSnippetExpr(query);
    const baseConditions = [
      eq(conversations.userId, userId),
      isNull(conversations.deletedAt),
      inArray(messages.role, ['user', 'assistant']),
    ];

    if (knowledgeBaseId) {
      baseConditions.push(eq(conversations.knowledgeBaseId, knowledgeBaseId));
    }

    const fulltextCondition = and(...baseConditions, sql`${fulltextScoreExpr} > 0`);

    try {
      const fulltextRows = await db
        .select({
          conversationId: conversations.id,
          conversationTitle: conversations.title,
          knowledgeBaseId: conversations.knowledgeBaseId,
          messageId: messages.id,
          role: messages.role,
          snippet: snippetExpr,
          matchedAt: messages.createdAt,
          score: fulltextScoreExpr,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(fulltextCondition)
        .orderBy(
          sql`CASE WHEN ${exactPositionExpr} > 0 THEN 0 ELSE 1 END`,
          desc(fulltextScoreExpr),
          desc(messages.createdAt)
        )
        .limit(limit)
        .offset(offset);

      if (fulltextRows.length > 0) {
        const totalResult = await db
          .select({ total: count() })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(fulltextCondition);

        return {
          items: fulltextRows.map((row) => ({
            conversationId: row.conversationId,
            conversationTitle: row.conversationTitle,
            knowledgeBaseId: row.knowledgeBaseId,
            messageId: row.messageId,
            role: row.role,
            snippet: row.snippet,
            matchedAt: row.matchedAt,
            score: row.score,
          })),
          total: totalResult[0]?.total ?? 0,
        };
      }
    } catch (error) {
      if (!isMissingFulltextIndexError(error)) {
        throw error;
      }
    }

    const likePattern = `%${query}%`;
    const likeCondition = and(
      ...baseConditions,
      sql`LOWER(${messages.content}) LIKE LOWER(${likePattern})`
    );

    const likeRows = await db
      .select({
        conversationId: conversations.id,
        conversationTitle: conversations.title,
        knowledgeBaseId: conversations.knowledgeBaseId,
        messageId: messages.id,
        role: messages.role,
        snippet: snippetExpr,
        matchedAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(likeCondition)
      .orderBy(asc(exactPositionExpr), desc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    const totalLikeResult = await db
      .select({ total: count() })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(likeCondition);

    return {
      items: likeRows.map((row) => ({
        conversationId: row.conversationId,
        conversationTitle: row.conversationTitle,
        knowledgeBaseId: row.knowledgeBaseId,
        messageId: row.messageId,
        role: row.role,
        snippet: row.snippet,
        matchedAt: row.matchedAt,
        score: null,
      })),
      total: totalLikeResult[0]?.total ?? 0,
    };
  },
};
