import { beforeEach, describe, expect, it, vi } from 'vitest';

const chatApiMocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  sendMessageWithSSE: vi.fn(),
  logClientError: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  conversationApi: {
    create: chatApiMocks.createConversation,
    getById: chatApiMocks.getConversation,
  },
  sendMessageWithSSE: chatApiMocks.sendMessageWithSSE,
}));

vi.mock('@/lib/logger', () => ({
  logClientError: chatApiMocks.logClientError,
  logClientWarning: vi.fn(),
}));

import { useChatPanelStore } from '@/stores/chatPanelStore';

describe('chatPanelStore loadConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatPanelStore.setState({
      isOpen: false,
      knowledgeBaseId: null,
      conversationId: null,
      messages: [],
      selectedDocumentIds: [],
      isLoading: false,
      abortController: null,
      showSidebar: false,
    });
  });

  it('hydrates final and retrieved citations plus thinkingContent and stopReason from message metadata', async () => {
    chatApiMocks.getConversation.mockResolvedValue({
      id: 'conv-1',
      knowledgeBaseId: 'kb-1',
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Answer',
          createdAt: new Date().toISOString(),
          metadata: {
            stopReason: 'budget_exhausted',
            thinkingContent: 'first step\nsecond step',
            retrievedSources: [
              {
                sourceType: 'node',
                nodeId: 'node-raw',
                documentId: 'doc-1',
                documentTitle: 'Doc',
                excerpt: 'Raw evidence',
              },
            ],
            finalCitations: [
              {
                sourceType: 'node',
                nodeId: 'node-final',
                documentId: 'doc-1',
                documentTitle: 'Doc',
                excerpt: 'Final evidence',
              },
            ],
          },
        },
      ],
    });

    await useChatPanelStore.getState().loadConversation('conv-1');

    const state = useChatPanelStore.getState();
    expect(state.messages[0]).toMatchObject({
      id: 'msg-1',
      thinkingContent: 'first step\nsecond step',
      stopReason: 'budget_exhausted',
    });
    expect(state.messages[0]?.citations?.[0]).toMatchObject({
      nodeId: 'node-final',
    });
    expect(state.messages[0]?.retrievedSources?.[0]).toMatchObject({
      nodeId: 'node-raw',
    });
  });

  it('logs loadConversation failures without mutating existing state', async () => {
    const error = new Error('load failed');
    chatApiMocks.getConversation.mockRejectedValue(error);

    await useChatPanelStore.getState().loadConversation('conv-404');

    expect(chatApiMocks.logClientError).toHaveBeenCalledWith(
      'chatPanelStore.loadConversation',
      error,
      { conversationId: 'conv-404' }
    );
    expect(useChatPanelStore.getState().conversationId).toBeNull();
    expect(useChatPanelStore.getState().messages).toEqual([]);
  });
});
