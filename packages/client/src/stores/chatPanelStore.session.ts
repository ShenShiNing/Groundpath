import { conversationApi } from '@/api';
import { logClientError } from '@/lib/logger';
import type { ChatPanelState } from './chatPanelStore.types';
import { type GetState, type SetState, toConversationState } from './chatPanelStore.core';

type SessionActions = Pick<
  ChatPanelState,
  | 'open'
  | 'close'
  | 'toggle'
  | 'setDocumentScope'
  | 'clearMessages'
  | 'loadConversation'
  | 'toggleSidebar'
  | 'startNewConversation'
  | 'switchKnowledgeBase'
  | 'switchConversation'
  | 'clearFocusMessageId'
>;

export function createSessionActions(set: SetState, get: GetState): SessionActions {
  return {
    open: (kbId?: string | null) => {
      const normalizedKbId = kbId ?? null;
      const { knowledgeBaseId } = get();
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
  };
}
