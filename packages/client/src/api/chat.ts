import type { ApiResponse } from '@knowledge-agent/shared/types';
import { apiClient, unwrapResponse } from './client';

// ============================================================================
// Types
// ============================================================================

export interface ChatCitation {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  pageNumber?: number;
  score?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  createdAt: string;
}

export interface SendMessageRequest {
  message: string;
  documentIds?: string[];
  conversationId?: string;
}

export interface SendMessageResponse {
  message: ChatMessage;
  conversationId: string;
}

export interface ChatConversation {
  id: string;
  knowledgeBaseId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// API
// ============================================================================

export const chatApi = {
  /**
   * Send a message to the AI and get a response
   */
  async sendMessage(kbId: string, data: SendMessageRequest): Promise<SendMessageResponse> {
    const response = await apiClient.post<ApiResponse<SendMessageResponse>>(
      `/api/knowledge-bases/${kbId}/chat`,
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * Get conversation history
   */
  async getConversation(kbId: string, conversationId: string): Promise<ChatConversation> {
    const response = await apiClient.get<ApiResponse<ChatConversation>>(
      `/api/knowledge-bases/${kbId}/chat/${conversationId}`
    );
    return unwrapResponse(response.data);
  },

  /**
   * List conversations for a knowledge base
   */
  async listConversations(kbId: string): Promise<ChatConversation[]> {
    const response = await apiClient.get<ApiResponse<ChatConversation[]>>(
      `/api/knowledge-bases/${kbId}/chat`
    );
    return unwrapResponse(response.data);
  },

  /**
   * Delete a conversation
   */
  async deleteConversation(kbId: string, conversationId: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/api/knowledge-bases/${kbId}/chat/${conversationId}`
    );
    unwrapResponse(response.data);
  },
};
