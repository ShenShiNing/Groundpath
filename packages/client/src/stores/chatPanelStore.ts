import { create } from 'zustand';
import i18n from '@/i18n/i18n';
import { conversationApi, sendMessageWithSSE } from '@/api';
import { queryClient } from '@/lib/query';
import type { ChatMessage, ChatPanelState, ToolStep } from './chatPanelStore.types';
import { toStoreCitation, agentTraceToToolSteps } from './chatPanelStore.types';

export type { Citation, ToolStep, ChatMessage, ChatPanelState } from './chatPanelStore.types';

function invalidateConversationQueries(): void {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey.includes('knowledgeBases') &&
      query.queryKey.includes('conversations'),
  });
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

  sendMessage: async (content: string, getAccessToken: () => string | null) => {
    const {
      knowledgeBaseId,
      conversationId,
      addMessage,
      updateLastMessage,
      appendToLastMessage,
      addToolStep,
      updateToolStep,
      selectedDocumentIds,
    } = get();

    const trimmedContent = content.trim();
    if (!trimmedContent) return;

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
      } catch {
        addMessage({
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: i18n.t('error.conversationFailed', { ns: 'chat' }),
          timestamp: new Date(),
        });
        return;
      }
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedContent,
      timestamp: new Date(),
    };
    addMessage(userMessage);

    // Add loading assistant message
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

    // Start SSE streaming
    const abortController = sendMessageWithSSE(
      convId,
      {
        content: trimmedContent,
        documentIds: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,
      },
      {
        onChunk: (text) => {
          appendToLastMessage(text);
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
          const fallbackMessage =
            error.code === 'LLM_CONFIG_NOT_FOUND'
              ? i18n.t('error.llmNotConfigured', { ns: 'chat' })
              : `Error: ${error.message}`;
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

  stopGeneration: () => {
    const { abortController, updateLastMessage } = get();
    if (abortController) {
      abortController.abort();
      updateLastMessage({ isLoading: false });
      invalidateConversationQueries();
      set({ isLoading: false, abortController: null });
    }
  },

  retryMessage: async (messageId: string, getAccessToken: () => string | null) => {
    if (get().isLoading) return;

    const { messages } = get();
    const assistantIdx = messages.findIndex((m) => m.id === messageId);
    if (assistantIdx < 0) return;

    // Find the user message right before this assistant message
    const userIdx = assistantIdx - 1;
    const userMsg = messages[userIdx];
    if (!userMsg || userMsg.role !== 'user') return;

    const userContent = userMsg.content;

    // Remove the old user + assistant pair from local messages
    set({ messages: messages.filter((_, i) => i !== userIdx && i !== assistantIdx) });

    // Re-send (adds new user message + loading assistant, starts SSE)
    await get().sendMessage(userContent, getAccessToken);
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
      const messages: ChatMessage[] = conversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.createdAt),
        citations:
          msg.metadata?.finalCitations?.map(toStoreCitation) ??
          msg.metadata?.citations?.map(toStoreCitation) ??
          msg.metadata?.retrievedSources?.map(toStoreCitation),
        retrievedSources: msg.metadata?.retrievedSources?.map(toStoreCitation),
        stopReason: msg.metadata?.stopReason,
        toolSteps: agentTraceToToolSteps(msg.metadata?.agentTrace),
      }));
      set({
        conversationId,
        knowledgeBaseId: conversation.knowledgeBaseId,
        messages,
      });
    } catch {
      // silently fail — caller can retry
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
