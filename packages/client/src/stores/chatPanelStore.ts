import { create } from 'zustand';

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
  messages: ChatMessage[];
  selectedDocumentIds: string[];
  isLoading: boolean;

  // Actions
  open: (kbId: string) => void;
  close: () => void;
  toggle: () => void;
  sendMessage: (content: string) => Promise<void>;
  setDocumentScope: (ids: string[]) => void;
  clearMessages: () => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (update: Partial<ChatMessage>) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useChatPanelStore = create<ChatPanelState>((set, get) => ({
  isOpen: false,
  knowledgeBaseId: null,
  messages: [],
  selectedDocumentIds: [],
  isLoading: false,

  open: (kbId: string) => {
    const { knowledgeBaseId } = get();
    // Clear messages if switching knowledge bases
    if (knowledgeBaseId !== kbId) {
      set({
        isOpen: true,
        knowledgeBaseId: kbId,
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

  sendMessage: async (content: string) => {
    const { knowledgeBaseId, addMessage, updateLastMessage } = get();

    if (!knowledgeBaseId || !content.trim()) return;

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

    try {
      // TODO: Replace with actual API call
      // const response = await chatApi.sendMessage(knowledgeBaseId, content, selectedDocumentIds);

      // Simulated response for now
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const mockCitations: Citation[] = [
        {
          id: 'cit-1',
          documentId: 'doc-1',
          documentTitle: 'Sample Document',
          chunkIndex: 0,
          content: 'This is a sample citation from the document...',
          pageNumber: 1,
          score: 0.95,
        },
      ];

      updateLastMessage({
        content: `Based on the documents in this knowledge base, I can help answer your question about "${content}".\n\nThis is a demo response - actual AI integration is pending. The response would include relevant information from your uploaded documents with proper citations [1].`,
        citations: mockCitations,
        isLoading: false,
      });
    } catch {
      updateLastMessage({
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        isLoading: false,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  setDocumentScope: (ids: string[]) => {
    set({ selectedDocumentIds: ids });
  },

  clearMessages: () => {
    set({ messages: [] });
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
}));
