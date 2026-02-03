import { v4 as uuidv4 } from 'uuid';
import type { MessageInfo, MessageRole, MessageMetadata } from '@knowledge-agent/shared/types';
import { messageRepository } from '../repositories/message.repository';
import type { Message } from '@shared/db/schema/ai/messages.schema';

function toMessageInfo(msg: Message): MessageInfo {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    role: msg.role as MessageRole,
    content: msg.content,
    metadata: msg.metadata as MessageMetadata | null,
    createdAt: msg.createdAt,
  };
}

export const messageService = {
  /**
   * Create a new message
   */
  async create(data: {
    conversationId: string;
    role: MessageRole;
    content: string;
    metadata?: MessageMetadata;
  }): Promise<MessageInfo> {
    const message = await messageRepository.create({
      id: uuidv4(),
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      metadata: data.metadata ?? null,
    });

    return toMessageInfo(message);
  },

  /**
   * Get messages for a conversation
   */
  async getByConversation(
    conversationId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<MessageInfo[]> {
    const messages = await messageRepository.listByConversation(conversationId, options);
    return messages.map(toMessageInfo);
  },

  /**
   * Get recent messages for context building
   */
  async getRecentForContext(conversationId: string, limit: number = 10): Promise<MessageInfo[]> {
    const messages = await messageRepository.getRecentMessages(conversationId, limit);
    return messages.map(toMessageInfo);
  },

  /**
   * Update message metadata (for adding citations after streaming)
   */
  async updateMetadata(messageId: string, metadata: MessageMetadata): Promise<void> {
    await messageRepository.updateMetadata(messageId, metadata);
  },

  /**
   * Count messages in a conversation
   */
  async count(conversationId: string): Promise<number> {
    return messageRepository.countByConversation(conversationId);
  },
};
