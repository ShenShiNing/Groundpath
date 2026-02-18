import type {
  ApiResponse,
  ConversationInfo,
  ConversationListItem,
  ConversationWithMessages,
  MessageInfo,
  Citation,
  SSEEvent,
} from '@knowledge-agent/shared/types';
import type {
  CreateConversationInput,
  UpdateConversationInput,
  SendMessageInput,
} from '@knowledge-agent/shared/schemas';
import {
  apiClient,
  unwrapResponse,
  fetchStreamWithAuth,
  parseSSEStream,
  createSSEDispatcher,
} from '@/lib/http';

// Re-export types for convenience
export type { ConversationInfo, ConversationListItem, MessageInfo, Citation, SSEEvent };

// ============================================================================
// Conversation API
// ============================================================================

export const conversationApi = {
  /**
   * Create a new conversation
   */
  async create(data: CreateConversationInput): Promise<ConversationInfo> {
    const response = await apiClient.post<ApiResponse<ConversationInfo>>(
      '/api/chat/conversations',
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * List conversations for the current user
   */
  async list(params?: {
    knowledgeBaseId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ConversationListItem[]> {
    const response = await apiClient.get<ApiResponse<ConversationListItem[]>>(
      '/api/chat/conversations',
      { params }
    );
    return unwrapResponse(response.data);
  },

  /**
   * Get a conversation with its messages
   */
  async getById(id: string): Promise<ConversationWithMessages> {
    const response = await apiClient.get<ApiResponse<ConversationWithMessages>>(
      `/api/chat/conversations/${id}`
    );
    return unwrapResponse(response.data);
  },

  /**
   * Update conversation title
   */
  async update(id: string, data: UpdateConversationInput): Promise<ConversationInfo> {
    const response = await apiClient.patch<ApiResponse<ConversationInfo>>(
      `/api/chat/conversations/${id}`,
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * Delete a conversation
   */
  async delete(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/api/chat/conversations/${id}`
    );
    unwrapResponse(response.data);
  },
};

// ============================================================================
// Message API
// ============================================================================

export const messageApi = {
  /**
   * Get messages for a conversation
   */
  async list(
    conversationId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<MessageInfo[]> {
    const response = await apiClient.get<ApiResponse<MessageInfo[]>>(
      `/api/chat/conversations/${conversationId}/messages`,
      { params }
    );
    return unwrapResponse(response.data);
  },
};

// ============================================================================
// SSE Streaming
// ============================================================================

export interface SSEHandlers {
  onChunk: (text: string) => void;
  onSources: (citations: Citation[]) => void;
  onDone: (data: { messageId: string }) => void;
  onError: (error: { code: string; message: string }) => void;
}

/**
 * Low-level SSE sender: parses stream and emits events via handlers.
 * Returns an AbortController to cancel the stream.
 */
export function sendMessageWithSSE(
  conversationId: string,
  data: SendMessageInput,
  handlers: SSEHandlers,
  getAccessToken: () => string | null
): AbortController {
  const abortController = new AbortController();

  const run = async () => {
    const result = await fetchStreamWithAuth(
      `/api/chat/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify(data) },
      { getAccessToken, signal: abortController.signal }
    );

    if (!result.ok) {
      if (result.error.code !== 'ABORTED') {
        handlers.onError(result.error);
      }
      return;
    }

    const dispatcher = createSSEDispatcher<SSEEvent>(
      {
        chunk: handlers.onChunk,
        sources: handlers.onSources,
        done: handlers.onDone,
        error: handlers.onError,
      },
      handlers.onError
    );

    await parseSSEStream(result.reader, dispatcher);
  };

  run();
  return abortController;
}

// ============================================================================
// Legacy API (keeping for backward compatibility)
// ============================================================================

/** @deprecated Use conversationApi and messageApi instead */
export const chatApi = {
  sendMessage() {
    throw new Error('Use sendMessageWithSSE for streaming responses');
  },

  async getConversation(conversationId: string) {
    return conversationApi.getById(conversationId);
  },

  async listConversations(kbId: string) {
    return conversationApi.list({ knowledgeBaseId: kbId });
  },

  async deleteConversation(_kbId: string, conversationId: string) {
    return conversationApi.delete(conversationId);
  },
};
