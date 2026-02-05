import { v4 as uuidv4 } from 'uuid';
import type { ConversationInfo, ConversationListItem } from '@knowledge-agent/shared/types';
import { CHAT_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { conversationRepository } from '../repositories/conversation.repository';
import { messageRepository } from '../repositories/message.repository';
import { Errors } from '@shared/errors';
import type { Conversation } from '@shared/db/schema/ai/conversations.schema';

function toConversationInfo(conv: Conversation): ConversationInfo {
  return {
    id: conv.id,
    userId: conv.userId,
    knowledgeBaseId: conv.knowledgeBaseId,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

export const conversationService = {
  /**
   * Create a new conversation
   */
  async create(
    userId: string,
    data: { knowledgeBaseId?: string; title?: string }
  ): Promise<ConversationInfo> {
    const conversation = await conversationRepository.create({
      id: uuidv4(),
      userId,
      knowledgeBaseId: data.knowledgeBaseId ?? null,
      title: data.title ?? 'New Conversation',
      createdBy: userId,
    });

    return toConversationInfo(conversation);
  },

  /**
   * Get conversation by ID with ownership check
   */
  async getById(userId: string, conversationId: string): Promise<ConversationInfo> {
    const conversation = await conversationRepository.findByIdAndUser(conversationId, userId);
    if (!conversation) {
      throw Errors.auth(CHAT_ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found', 404);
    }
    return toConversationInfo(conversation);
  },

  /**
   * List conversations for a user
   */
  async list(
    userId: string,
    options?: { knowledgeBaseId?: string; limit?: number; offset?: number }
  ): Promise<ConversationListItem[]> {
    const conversations = await conversationRepository.listByUser(userId, options);

    if (conversations.length === 0) return [];

    // Batch fetch message stats to avoid N+1 queries
    const conversationIds = conversations.map((c) => c.id);
    const statsMap = await messageRepository.getStatsForConversations(conversationIds);

    return conversations.map((conv) => {
      const stats = statsMap.get(conv.id) ?? { count: 0, lastMessageAt: null };
      return {
        id: conv.id,
        title: conv.title,
        knowledgeBaseId: conv.knowledgeBaseId,
        messageCount: stats.count,
        lastMessageAt: stats.lastMessageAt,
        createdAt: conv.createdAt,
      };
    });
  },

  /**
   * Update conversation title
   */
  async updateTitle(
    userId: string,
    conversationId: string,
    title: string
  ): Promise<ConversationInfo> {
    const conversation = await conversationRepository.findByIdAndUser(conversationId, userId);
    if (!conversation) {
      throw Errors.auth(CHAT_ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found', 404);
    }

    const updated = await conversationRepository.update(conversationId, {
      title,
      updatedBy: userId,
    });

    return toConversationInfo(updated!);
  },

  /**
   * Delete conversation (soft delete)
   */
  async delete(userId: string, conversationId: string): Promise<void> {
    const conversation = await conversationRepository.findByIdAndUser(conversationId, userId);
    if (!conversation) {
      throw Errors.auth(CHAT_ERROR_CODES.CONVERSATION_NOT_FOUND, 'Conversation not found', 404);
    }

    await conversationRepository.softDelete(conversationId, userId);
  },

  /**
   * Validate ownership and return conversation
   */
  async validateOwnership(userId: string, conversationId: string): Promise<Conversation> {
    const conversation = await conversationRepository.findByIdAndUser(conversationId, userId);
    if (!conversation) {
      throw Errors.auth(
        CHAT_ERROR_CODES.CONVERSATION_NOT_FOUND,
        'Conversation not found or access denied',
        404
      );
    }
    return conversation;
  },

  /**
   * Auto-generate title from first message
   */
  generateTitle(content: string): string {
    // Truncate to reasonable length
    const maxLength = 50;
    let title = content.trim().replace(/\s+/g, ' ');
    if (title.length > maxLength) {
      title = title.substring(0, maxLength - 3) + '...';
    }
    return title || 'New Conversation';
  },
};
