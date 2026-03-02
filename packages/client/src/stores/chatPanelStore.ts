import { create } from 'zustand';
import { conversationApi, sendMessageWithSSE } from '@/api';
import { queryClient } from '@/lib/query';
import type { Citation as APICitation } from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

export interface Citation {
  id: string;
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
  timestamp: Date;
  citations?: Citation[];
  isLoading?: boolean;
}

export interface ChatPanelState {
  isOpen: boolean;
  knowledgeBaseId: string | null;
  conversationId: string | null;
  messages: ChatMessage[];
  selectedDocumentIds: string[];
  isLoading: boolean;
  abortController: AbortController | null;
  showSidebar: boolean;

  // Actions
  open: (kbId?: string | null) => void;
  close: () => void;
  toggle: () => void;
  sendMessage: (content: string, getAccessToken: () => string | null) => Promise<void>;
  stopGeneration: () => void;
  setDocumentScope: (ids: string[]) => void;
  clearMessages: () => void;
  loadConversation: (conversationId: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (update: Partial<ChatMessage>) => void;
  appendToLastMessage: (text: string) => void;

  // Sidebar actions
  toggleSidebar: () => void;
  startNewConversation: () => void;
  switchConversation: (conversationId: string) => Promise<void>;
}

// Helper to convert API citation to store citation
function toStoreCitation(citation: APICitation, index: number): Citation {
  return {
    id: `cit-${index}`,
    documentId: citation.documentId,
    documentTitle: citation.documentTitle,
    chunkIndex: citation.chunkIndex,
    content: citation.content,
    pageNumber: citation.pageNumber,
    score: citation.score,
  };
}

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
          content: '无法开始对话。请先前往 [AI 设置页面](/settings/ai) 完成模型配置后再试。',
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
          updateLastMessage({ citations: storeCitations });
        },
        onDone: (data) => {
          const lastMsg = get().messages[get().messages.length - 1];
          if (lastMsg && !lastMsg.content.trim()) {
            updateLastMessage({
              id: data.messageId,
              content: '模型返回了空响应，请重试。',
              isLoading: false,
            });
          } else {
            updateLastMessage({ id: data.messageId, isLoading: false });
          }
          invalidateConversationQueries();
          set({ isLoading: false, abortController: null });
        },
        onError: (error) => {
          const fallbackMessage =
            error.code === 'LLM_CONFIG_NOT_FOUND'
              ? '尚未配置 AI 模型。请先前往 [AI 设置页面](/settings/ai) 完成配置后再试。'
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

  setDocumentScope: (ids: string[]) => {
    set({ selectedDocumentIds: ids });
  },

  clearMessages: () => {
    set({ messages: [], conversationId: null });
  },

  loadConversation: async (conversationId: string) => {
    try {
      const conversation = await conversationApi.getById(conversationId);
      const messages: ChatMessage[] = conversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.createdAt),
        citations: msg.metadata?.citations?.map(toStoreCitation),
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

  // Sidebar actions
  toggleSidebar: () => {
    set((state) => ({ showSidebar: !state.showSidebar }));
  },

  startNewConversation: () => {
    set({
      conversationId: null,
      messages: [],
      selectedDocumentIds: [],
    });
  },

  switchConversation: async (conversationId: string) => {
    const { loadConversation } = get();
    await loadConversation(conversationId);
  },
}));
