import { create } from 'zustand';
import { conversationApi } from '@/api';
import { logClientError } from '@/lib/logger';
import type { ChatMessage, ChatPanelState, ToolStep } from './chatPanelStore.types';
import { toConversationState } from './chatPanelStore.helpers';
import {
  createSendMessageAction,
  createEditMessageAction,
  createRetryMessageAction,
  createStopGenerationAction,
} from './chatPanelStore.messageActions';

export type { Citation, ToolStep, ChatMessage, ChatPanelState } from './chatPanelStore.types';

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

  sendMessage: createSendMessageAction(set, get),
  editMessage: createEditMessageAction(set, get),
  retryMessage: createRetryMessageAction(set, get),
  stopGeneration: createStopGenerationAction(set, get),

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
