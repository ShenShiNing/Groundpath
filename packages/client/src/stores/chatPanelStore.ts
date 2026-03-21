import { create } from 'zustand';
import { createMessageActions } from './chatPanelStore.actions';
import { createSessionActions } from './chatPanelStore.session';
import { createStreamActions } from './chatPanelStore.stream';
import type { ChatPanelState } from './chatPanelStore.types';

export type { Citation, ToolStep, ChatMessage, ChatPanelState } from './chatPanelStore.types';

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

  ...createMessageActions(set),
  ...createSessionActions(set, get),
  ...createStreamActions(set, get),
}));
