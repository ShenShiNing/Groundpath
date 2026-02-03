import { create } from 'zustand';
import { conversationApi, sendMessageWithSSE } from '@/api/chat';
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
  open: (kbId: string) => void;
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

  open: (kbId: string) => {
    const { knowledgeBaseId } = get();
    // Clear messages if switching knowledge bases
    if (knowledgeBaseId !== kbId) {
      set({
        isOpen: true,
        knowledgeBaseId: kbId,
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

    if (!knowledgeBaseId || !content.trim()) return;

    // Create conversation if needed
    let convId = conversationId;
    if (!convId) {
      try {
        const conversation = await conversationApi.create({
          knowledgeBaseId,
          title: content.substring(0, 50),
        });
        convId = conversation.id;
        set({ conversationId: convId });
      } catch (error) {
        console.error('Failed to create conversation:', error);
        addMessage({
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'Failed to start conversation. Please check your AI settings.',
          timestamp: new Date(),
        });
        return;
      }
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim(),
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

    // Start SSE streaming
    const abortController = sendMessageWithSSE(
      convId,
      {
        content: content.trim(),
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
          updateLastMessage({ id: data.messageId, isLoading: false });
          set({ isLoading: false, abortController: null });
        },
        onError: (error) => {
          updateLastMessage({
            content:
              get().messages[get().messages.length - 1]?.content || `Error: ${error.message}`,
            isLoading: false,
          });
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
    } catch (error) {
      console.error('Failed to load conversation:', error);
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
