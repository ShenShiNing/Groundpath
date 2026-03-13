import { create } from 'zustand';
import i18n from '@/i18n/i18n';
import { conversationApi, sendMessageWithSSE } from '@/api';
import { logClientError } from '@/lib/logger';
import { queryClient, queryKeys } from '@/lib/query';
import type { ConversationWithMessages, MessageInfo } from '@knowledge-agent/shared/types';
import type { ChatMessage, ChatPanelState, StreamControls, ToolStep } from './chatPanelStore.types';
import { toStoreCitation, agentTraceToToolSteps } from './chatPanelStore.types';

export type { Citation, ToolStep, ChatMessage, ChatPanelState } from './chatPanelStore.types';

function invalidateConversationQueries(): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.conversations.lists(),
  });
}

function getChatErrorMessage(error: { code: string; message: string }): string {
  switch (error.code) {
    case 'LLM_CONFIG_NOT_FOUND':
      return i18n.t('error.llmNotConfigured', { ns: 'chat' });
    case 'LLM_DECRYPTION_FAILED':
      return i18n.t('error.llmApiKeyUnreadable', { ns: 'chat' });
    default:
      return `Error: ${error.message}`;
  }
}

function toStoreMessage(message: MessageInfo): ChatMessage {
  return {
    id: message.id,
    role: message.role as 'user' | 'assistant',
    content: message.content,
    timestamp: new Date(message.createdAt),
    citations:
      message.metadata?.finalCitations?.map(toStoreCitation) ??
      message.metadata?.citations?.map(toStoreCitation) ??
      message.metadata?.retrievedSources?.map(toStoreCitation),
    retrievedSources: message.metadata?.retrievedSources?.map(toStoreCitation),
    stopReason: message.metadata?.stopReason,
    toolSteps: agentTraceToToolSteps(message.metadata?.agentTrace),
  };
}

function toConversationState(
  conversation: ConversationWithMessages
): Pick<ChatPanelState, 'conversationId' | 'knowledgeBaseId' | 'messages'> {
  return {
    conversationId: conversation.id,
    knowledgeBaseId: conversation.knowledgeBaseId,
    messages: conversation.messages.map(toStoreMessage),
  };
}

// ============================================================================
// Store
// ============================================================================

export const useChatPanelStore = create<ChatPanelState>((set, get) => ({
  isOpen: false,
  knowledgeBaseId: null,
  conversationId: null,
  focusMessageId: null,
  focusKeyword: null,
  messages: [],
  selectedDocumentIds: [],
  isLoading: false,
  abortController: null,
  showSidebar: false,

  open: (kbId?: string | null) => {
    const normalizedKbId = kbId ?? null;
    const { knowledgeBaseId } = get();
    // Clear messages if switching knowledge bases
    if (knowledgeBaseId !== normalizedKbId) {
      set({
        isOpen: true,
        knowledgeBaseId: normalizedKbId,
        conversationId: null,
        focusMessageId: null,
        focusKeyword: null,
        messages: [],
        selectedDocumentIds: [],
      });
    } else {
      set({ isOpen: true });
    }
  },

  close: () => {
    set({ isOpen: false });
  },

  toggle: () => {
    const { isOpen, knowledgeBaseId } = get();
    if (isOpen) {
      set({ isOpen: false });
    } else if (knowledgeBaseId) {
      set({ isOpen: true });
    }
  },

  sendMessage: async (
    content: string,
    getAccessToken: () => string | null,
    stream?: StreamControls,
    options?: { editedMessageId?: string }
  ) => {
    const {
      knowledgeBaseId,
      conversationId,
      addMessage,
      updateLastMessage,
      appendToLastMessage,
      appendThinkingToLastMessage,
      addToolStep,
      updateToolStep,
      selectedDocumentIds,
    } = get();

    const trimmedContent = content.trim();
    if (!trimmedContent) return;
    stream?.reset();

    const isEdit = !!options?.editedMessageId;

    if (!isEdit) {
      // Add user message immediately so the viewport can react before network round-trips.
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmedContent,
        timestamp: new Date(),
      };
      addMessage(userMessage);
    }

    // Add a placeholder assistant message right away and fill it as the stream arrives.
    const assistantId = `assistant-${Date.now()}`;
    const loadingMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };
    addMessage(loadingMessage);

    set({ isLoading: true });
    invalidateConversationQueries();

    // Create conversation if needed
    let convId = conversationId;
    if (!convId) {
      try {
        const conversation = await conversationApi.create(
          knowledgeBaseId
            ? {
                knowledgeBaseId,
                title: trimmedContent.substring(0, 50),
              }
            : {
                title: trimmedContent.substring(0, 50),
              }
        );
        convId = conversation.id;
        set({ conversationId: convId });
        invalidateConversationQueries();
      } catch (error) {
        logClientError('chatPanelStore.sendMessage.createConversation', error, {
          knowledgeBaseId,
        });
        updateLastMessage({
          content: i18n.t('error.conversationFailed', { ns: 'chat' }),
          isLoading: false,
        });
        set({ isLoading: false, abortController: null });
        return;
      }
    }

    // Start SSE streaming
    const abortController = sendMessageWithSSE(
      convId,
      {
        content: trimmedContent,
        documentIds: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,
        editedMessageId: options?.editedMessageId,
      },
      {
        onChunk: (text) => {
          if (stream) {
            stream.push(text);
            return;
          }
          appendToLastMessage(text);
        },
        onThinking: (text) => {
          appendThinkingToLastMessage(text);
        },
        onSources: (citations) => {
          const storeCitations = citations.map(toStoreCitation);
          updateLastMessage({ citations: storeCitations, retrievedSources: storeCitations });
        },
        onToolStart: (data) => {
          addToolStep({
            stepIndex: data.stepIndex,
            toolCalls: data.toolCalls,
            status: 'running',
          });
        },
        onToolEnd: (data) => {
          updateToolStep(data.stepIndex, {
            toolResults: data.toolResults,
            durationMs: data.durationMs,
            status: 'completed',
          });
        },
        onDone: (data) => {
          stream?.flush();
          // Update user message with the real DB id
          if (data.userMessageId) {
            set((state) => {
              const msgs = [...state.messages];
              const userIdx = msgs.length - 2;
              if (userIdx >= 0 && msgs[userIdx]?.role === 'user') {
                msgs[userIdx] = { ...msgs[userIdx], id: data.userMessageId! };
              }
              return { messages: msgs };
            });
          }
          const lastMsg = get().messages[get().messages.length - 1];
          if (lastMsg && !lastMsg.content.trim()) {
            updateLastMessage({
              id: data.messageId,
              content: i18n.t('error.emptyResponse', { ns: 'chat' }),
              stopReason: data.stopReason,
              isLoading: false,
            });
          } else {
            updateLastMessage({
              id: data.messageId,
              stopReason: data.stopReason,
              isLoading: false,
            });
          }
          invalidateConversationQueries();
          set({ isLoading: false, abortController: null });
        },
        onError: (error) => {
          stream?.flush();
          const fallbackMessage = getChatErrorMessage(error);
          updateLastMessage({
            content: get().messages[get().messages.length - 1]?.content || fallbackMessage,
            isLoading: false,
          });
          invalidateConversationQueries();
          set({ isLoading: false, abortController: null });
        },
      },
      getAccessToken
    );

    set({ abortController });
  },

  editMessage: async (
    messageId: string,
    content: string,
    getAccessToken: () => string | null,
    stream?: StreamControls
  ) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;

    const { conversationId, messages, isLoading, stopGeneration } = get();
    if (!conversationId) return;

    const userIdx = messages.findIndex((message) => message.id === messageId);
    if (userIdx < 0) return;

    const targetMessage = messages[userIdx];
    if (!targetMessage || targetMessage.role !== 'user') return;

    const nextMessage = messages[userIdx + 1];
    const isPendingLatestUser =
      isLoading &&
      userIdx === messages.length - 2 &&
      nextMessage?.role === 'assistant' &&
      nextMessage.isLoading;

    if (isLoading && !isPendingLatestUser) {
      return;
    }

    if (isPendingLatestUser) {
      stream?.flush();
      stopGeneration();
    }

    // Latest pair: edit in-place, clear the assistant response, and resend
    const isLatestPair = userIdx === messages.length - 2 && nextMessage?.role === 'assistant';

    if (isLatestPair) {
      set((state) => ({
        messages: [
          ...state.messages.slice(0, userIdx),
          { ...targetMessage, content: trimmedContent },
        ],
      }));
      // Only use editedMessageId when we have the real DB id
      const hasRealId = !messageId.startsWith('user-');
      await get().sendMessage(
        trimmedContent,
        getAccessToken,
        stream,
        hasRealId ? { editedMessageId: messageId } : undefined
      );
    } else {
      // Historical: send the edited content as a new message
      await get().sendMessage(trimmedContent, getAccessToken, stream);
    }
  },

  stopGeneration: () => {
    const { abortController, updateLastMessage } = get();
    if (abortController) {
      abortController.abort();
      updateLastMessage({ isLoading: false, stopReason: 'user_aborted' });
      invalidateConversationQueries();
      set({ isLoading: false, abortController: null });
    }
  },

  retryMessage: async (
    messageId: string,
    getAccessToken: () => string | null,
    stream?: StreamControls
  ) => {
    if (get().isLoading) return;

    const { conversationId, messages } = get();
    if (!conversationId) return;

    const assistantIdx = messages.findIndex((m) => m.id === messageId);
    if (assistantIdx < 0) return;

    // Find the user message right before this assistant message
    const userIdx = assistantIdx - 1;
    const userMsg = messages[userIdx];
    if (!userMsg || userMsg.role !== 'user') return;

    // Latest pair: remove assistant, resend with editedMessageId
    const isLatestPair =
      userIdx === messages.length - 2 && messages[userIdx + 1]?.role === 'assistant';

    if (isLatestPair) {
      const hasRealId = !userMsg.id.startsWith('user-');
      set((state) => ({
        messages: state.messages.slice(0, assistantIdx),
      }));
      await get().sendMessage(
        userMsg.content,
        getAccessToken,
        stream,
        hasRealId ? { editedMessageId: userMsg.id } : undefined
      );
    } else {
      // Historical: send user content as a new message
      await get().sendMessage(userMsg.content, getAccessToken, stream);
    }
  },

  setDocumentScope: (ids: string[]) => {
    set({ selectedDocumentIds: ids });
  },

  clearMessages: () => {
    set({ messages: [], conversationId: null, focusMessageId: null, focusKeyword: null });
  },

  loadConversation: async (conversationId: string) => {
    try {
      const conversation = await conversationApi.getById(conversationId);
      set({
        ...toConversationState(conversation),
      });
    } catch (error) {
      logClientError('chatPanelStore.loadConversation', error, { conversationId });
    }
  },

  addMessage: (message: ChatMessage) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  updateLastMessage: (update: Partial<ChatMessage>) => {
    set((state) => {
      const messages = [...state.messages];
      const lastIndex = messages.length - 1;
      if (lastIndex >= 0) {
        messages[lastIndex] = { ...messages[lastIndex], ...update };
      }
      return { messages };
    });
  },

  appendToLastMessage: (text: string) => {
    set((state) => {
      const messages = [...state.messages];
      const lastIndex = messages.length - 1;
      if (lastIndex >= 0 && messages[lastIndex]) {
        messages[lastIndex] = {
          ...messages[lastIndex],
          content: messages[lastIndex].content + text,
        };
      }
      return { messages };
    });
  },

  appendThinkingToLastMessage: (text: string) => {
    set((state) => {
      const messages = [...state.messages];
      const lastIndex = messages.length - 1;
      if (lastIndex >= 0 && messages[lastIndex]) {
        messages[lastIndex] = {
          ...messages[lastIndex],
          thinkingContent: (messages[lastIndex].thinkingContent ?? '') + text,
        };
      }
      return { messages };
    });
  },

  addToolStep: (step: ToolStep) => {
    set((state) => {
      const messages = [...state.messages];
      const lastIndex = messages.length - 1;
      if (lastIndex >= 0 && messages[lastIndex]) {
        const msg = messages[lastIndex];
        messages[lastIndex] = {
          ...msg,
          toolSteps: [...(msg.toolSteps ?? []), step],
        };
      }
      return { messages };
    });
  },

  updateToolStep: (stepIndex: number, update: Partial<ToolStep>) => {
    set((state) => {
      const messages = [...state.messages];
      const lastIndex = messages.length - 1;
      if (lastIndex >= 0 && messages[lastIndex]?.toolSteps) {
        const msg = messages[lastIndex];
        const toolSteps = [...(msg.toolSteps ?? [])];
        const idx = toolSteps.findIndex((s) => s.stepIndex === stepIndex);
        if (idx >= 0 && toolSteps[idx]) {
          toolSteps[idx] = { ...toolSteps[idx], ...update };
        }
        messages[lastIndex] = { ...msg, toolSteps };
      }
      return { messages };
    });
  },

  // Sidebar actions
  toggleSidebar: () => {
    set((state) => ({ showSidebar: !state.showSidebar }));
  },

  startNewConversation: () => {
    set({
      conversationId: null,
      focusMessageId: null,
      focusKeyword: null,
      messages: [],
      selectedDocumentIds: [],
    });
  },

  switchKnowledgeBase: (newKbId: string | null) => {
    set({
      knowledgeBaseId: newKbId,
      selectedDocumentIds: [],
    });
  },

  switchConversation: async (
    conversationId: string,
    options?: { focusMessageId?: string | null; focusKeyword?: string | null }
  ) => {
    const { loadConversation } = get();
    set({
      focusMessageId: options?.focusMessageId ?? null,
      focusKeyword: options?.focusKeyword?.trim() || null,
    });
    await loadConversation(conversationId);
  },

  clearFocusMessageId: () => {
    set({ focusMessageId: null, focusKeyword: null });
  },
}));
