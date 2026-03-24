import type {
  ApiResponse,
  ConversationInfo,
  ConversationListItem,
  ConversationListResponse,
  ConversationWithMessages,
  ConversationSearchResponse,
  MessageInfo,
  Citation,
  SSEEvent,
  ToolCallInfo,
  ToolResultInfo,
} from '@groundpath/shared/types';
import type {
  CreateConversationInput,
  SearchConversationsInput,
  UpdateConversationInput,
  SendMessageInput,
} from '@groundpath/shared/schemas';
import {
  apiClient,
  unwrapResponse,
  fetchStreamWithAuth,
  parseSSEStream,
  createSSEDispatcher,
} from '@/lib/http';

// Re-export types for convenience
export type {
  ConversationInfo,
  ConversationListItem,
  ConversationListResponse,
  MessageInfo,
  Citation,
  SSEEvent,
};

// ============================================================================
// Conversation API
// ============================================================================

export const conversationApi = {
  /**
   * Create a new conversation
   */
  async create(data: CreateConversationInput): Promise<ConversationInfo> {
    const response = await apiClient.post<ApiResponse<ConversationInfo>>(
      '/api/v1/chat/conversations',
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
  }): Promise<ConversationListResponse> {
    const response = await apiClient.get<ApiResponse<ConversationListResponse>>(
      '/api/v1/chat/conversations',
      { params }
    );
    return unwrapResponse(response.data);
  },

  /**
   * Search conversations by message content
   */
  async search(params: SearchConversationsInput): Promise<ConversationSearchResponse> {
    const response = await apiClient.get<ApiResponse<ConversationSearchResponse>>(
      '/api/v1/chat/conversations/search',
      { params }
    );
    return unwrapResponse(response.data);
  },

  /**
   * Get a conversation with its messages
   */
  async getById(id: string): Promise<ConversationWithMessages> {
    const response = await apiClient.get<ApiResponse<ConversationWithMessages>>(
      `/api/v1/chat/conversations/${id}`
    );
    return unwrapResponse(response.data);
  },

  /**
   * Update conversation title
   */
  async update(id: string, data: UpdateConversationInput): Promise<ConversationInfo> {
    const response = await apiClient.patch<ApiResponse<ConversationInfo>>(
      `/api/v1/chat/conversations/${id}`,
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * Delete a conversation
   */
  async delete(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/api/v1/chat/conversations/${id}`
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
      `/api/v1/chat/conversations/${conversationId}/messages`,
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
  onThinking?: (text: string) => void;
  onSources: (citations: Citation[]) => void;
  onDone: (data: {
    messageId: string;
    userMessageId?: string;
    title?: string;
    stopReason?: import('@groundpath/shared/types').AgentStopReason;
  }) => void;
  onError: (error: { code: string; message: string }) => void;
  onToolStart?: (data: { stepIndex: number; toolCalls: ToolCallInfo[] }) => void;
  onToolEnd?: (data: {
    stepIndex: number;
    toolResults: ToolResultInfo[];
    durationMs: number;
  }) => void;
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
      `/api/v1/chat/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify(data) },
      { getAccessToken, signal: abortController.signal }
    );

    if (!result.ok) {
      if (result.error.code !== 'ABORTED') {
        handlers.onError(result.error);
      }
      return;
    }

    let receivedTerminalEvent = false;
    const wrapTerminal =
      <T>(fn: (data: T) => void) =>
      (data: T) => {
        receivedTerminalEvent = true;
        fn(data);
      };

    const dispatcher = createSSEDispatcher<SSEEvent>(
      {
        chunk: handlers.onChunk,
        thinking: handlers.onThinking,
        sources: handlers.onSources,
        done: wrapTerminal(handlers.onDone),
        error: wrapTerminal(handlers.onError),
        tool_start: handlers.onToolStart,
        tool_end: handlers.onToolEnd,
      },
      wrapTerminal(handlers.onError)
    );

    await parseSSEStream(result.reader, dispatcher, {
      onComplete: () => {
        // Safety net: if stream ended without done/error event, reset loading state
        if (!receivedTerminalEvent) {
          handlers.onError({
            code: 'STREAM_ENDED_UNEXPECTEDLY',
            message: 'Response stream ended without completion signal',
          });
        }
      },
    });
  };

  run().catch((error) => {
    handlers.onError({
      code: 'UNEXPECTED_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    });
  });
  return abortController;
}

// ============================================================================
// Legacy API (keeping for backward compatibility)
// ============================================================================

/** @deprecated Use conversationApi and messageApi instead */
export const chatApi = {
  sendMessage() {
    throw new TypeError('Use sendMessageWithSSE for streaming responses');
  },

  async getConversation(conversationId: string) {
    return conversationApi.getById(conversationId);
  },

  async listConversations(kbId: string) {
    return (await conversationApi.list({ knowledgeBaseId: kbId })).items;
  },

  async deleteConversation(_kbId: string, conversationId: string) {
    return conversationApi.delete(conversationId);
  },
};
