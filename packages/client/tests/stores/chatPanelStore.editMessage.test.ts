import { beforeEach, describe, expect, it, vi } from 'vitest';

const chatApiMocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  forkConversation: vi.fn(),
  sendMessageWithSSE: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  conversationApi: {
    create: chatApiMocks.createConversation,
    getById: chatApiMocks.getConversation,
    fork: chatApiMocks.forkConversation,
  },
  sendMessageWithSSE: chatApiMocks.sendMessageWithSSE,
}));

import { useChatPanelStore } from '@/stores/chatPanelStore';

describe('chatPanelStore editMessage and retryMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatApiMocks.sendMessageWithSSE.mockImplementation(() => new AbortController());

    useChatPanelStore.setState({
      isOpen: false,
      knowledgeBaseId: 'kb-1',
      conversationId: 'conv-1',
      focusMessageId: null,
      focusKeyword: null,
      messages: [],
      selectedDocumentIds: [],
      isLoading: false,
      abortController: null,
      showSidebar: false,
    });
  });

  it('forks before the edited user message and resends the updated content', async () => {
    chatApiMocks.forkConversation.mockResolvedValue({
      id: 'conv-branch-1',
      knowledgeBaseId: 'kb-1',
      messages: [
        {
          id: 'fork-user-1',
          conversationId: 'conv-branch-1',
          role: 'user',
          content: 'Original question',
          metadata: null,
          createdAt: '2026-03-13T09:00:00.000Z',
        },
        {
          id: 'fork-assistant-1',
          conversationId: 'conv-branch-1',
          role: 'assistant',
          content: 'Original answer',
          metadata: null,
          createdAt: '2026-03-13T09:01:00.000Z',
        },
      ],
    });
    useChatPanelStore.setState({
      selectedDocumentIds: ['doc-1'],
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Original question',
          timestamp: new Date('2026-03-13T09:00:00.000Z'),
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Original answer',
          timestamp: new Date('2026-03-13T09:01:00.000Z'),
        },
        {
          id: 'user-2',
          role: 'user',
          content: 'Second question',
          timestamp: new Date('2026-03-13T09:02:00.000Z'),
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          content: 'Second answer',
          timestamp: new Date('2026-03-13T09:03:00.000Z'),
        },
      ],
    });

    await useChatPanelStore.getState().editMessage('user-2', 'Edited question', () => 'token');

    expect(chatApiMocks.forkConversation).toHaveBeenCalledWith('conv-1', {
      beforeMessageId: 'user-2',
    });
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-branch-1',
      {
        content: 'Edited question',
        documentIds: ['doc-1'],
      },
      expect.any(Object),
      expect.any(Function)
    );

    const state = useChatPanelStore.getState();
    expect(state.conversationId).toBe('conv-branch-1');
    expect(state.messages).toHaveLength(4);
    expect(state.messages.map((message) => message.content)).toEqual([
      'Original question',
      'Original answer',
      'Edited question',
      '',
    ]);
    expect(state.messages[3]).toMatchObject({
      role: 'assistant',
      isLoading: true,
    });
  });

  it('aborts the pending response before editing the latest unanswered user message', async () => {
    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');

    chatApiMocks.forkConversation.mockResolvedValue({
      id: 'conv-branch-2',
      knowledgeBaseId: 'kb-1',
      messages: [
        {
          id: 'fork-user-1',
          conversationId: 'conv-branch-2',
          role: 'user',
          content: 'Original question',
          metadata: null,
          createdAt: '2026-03-13T09:00:00.000Z',
        },
      ],
    });
    useChatPanelStore.setState({
      isLoading: true,
      abortController,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Original question',
          timestamp: new Date('2026-03-13T09:00:00.000Z'),
        },
        {
          id: 'user-2',
          role: 'user',
          content: 'Pending question',
          timestamp: new Date('2026-03-13T09:01:00.000Z'),
        },
        {
          id: 'assistant-pending',
          role: 'assistant',
          content: '',
          timestamp: new Date('2026-03-13T09:01:30.000Z'),
          isLoading: true,
        },
      ],
    });

    await useChatPanelStore
      .getState()
      .editMessage('user-2', 'Edited pending question', () => 'token');

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(chatApiMocks.forkConversation).toHaveBeenCalledWith('conv-1', {
      beforeMessageId: 'user-2',
    });
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-branch-2',
      {
        content: 'Edited pending question',
        documentIds: undefined,
      },
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('retries from a forked conversation so regeneration does not keep stale server history', async () => {
    chatApiMocks.forkConversation.mockResolvedValue({
      id: 'conv-branch-3',
      knowledgeBaseId: 'kb-1',
      messages: [],
    });
    useChatPanelStore.setState({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'Question to retry',
          timestamp: new Date('2026-03-13T09:00:00.000Z'),
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Answer to retry',
          timestamp: new Date('2026-03-13T09:01:00.000Z'),
        },
      ],
    });

    await useChatPanelStore.getState().retryMessage('assistant-1', () => 'token');

    expect(chatApiMocks.forkConversation).toHaveBeenCalledWith('conv-1', {
      beforeMessageId: 'user-1',
    });
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-branch-3',
      {
        content: 'Question to retry',
        documentIds: undefined,
      },
      expect.any(Object),
      expect.any(Function)
    );
  });
});
