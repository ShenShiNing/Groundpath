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
import { apiClient, unwrapResponse, getOrRefreshToken, hasRefreshToken } from './client';

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
 * Send a message with SSE streaming response
 * Returns an AbortController to cancel the stream
 */
export function sendMessageWithSSE(
  conversationId: string,
  data: SendMessageInput,
  handlers: SSEHandlers,
  getAccessToken: () => string | null
): AbortController {
  const abortController = new AbortController();

  const sendRequest = async (isRetry = false) => {
    try {
      const token = getAccessToken();
      const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(data),
        signal: abortController.signal,
      });

      // Handle 401 - try to refresh token and retry once
      if (response.status === 401 && !isRetry && hasRefreshToken()) {
        try {
          await getOrRefreshToken();
          // Retry with new token
          return sendRequest(true);
        } catch {
          // Refresh failed, report error
          handlers.onError({
            code: 'AUTH_ERROR',
            message: 'Session expired. Please login again.',
          });
          return;
        }
      }

      if (!response.ok) {
        const errorData = await response.json();
        handlers.onError({
          code: errorData.error?.code || 'REQUEST_FAILED',
          message: errorData.error?.message || `HTTP ${response.status}`,
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        handlers.onError({ code: 'NO_BODY', message: 'No response body' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

              try {
                const event = JSON.parse(jsonStr) as SSEEvent;
                switch (event.type) {
                  case 'chunk':
                    handlers.onChunk(event.data);
                    break;
                  case 'sources':
                    handlers.onSources(event.data);
                    break;
                  case 'done':
                    handlers.onDone(event.data);
                    break;
                  case 'error':
                    handlers.onError(event.data);
                    break;
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Intentional abort
      }
      handlers.onError({
        code: 'STREAM_ERROR',
        message: error instanceof Error ? error.message : 'Stream failed',
      });
    }
  };

  sendRequest();
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
