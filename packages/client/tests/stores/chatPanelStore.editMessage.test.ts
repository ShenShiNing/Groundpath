import { beforeEach, describe, expect, it, vi } from 'vitest';

const chatApiMocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  sendMessageWithSSE: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  conversationApi: {
    create: chatApiMocks.createConversation,
    getById: chatApiMocks.getConversation,
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

  it('edits the latest user message in-place and resends with editedMessageId', async () => {
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

    // Should NOT fork — send directly with editedMessageId
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-1',
      {
        content: 'Edited question',
        documentIds: ['doc-1'],
        editedMessageId: 'user-2',
      },
      expect.any(Object),
      expect.any(Function)
    );

    const state = useChatPanelStore.getState();
    // Conversation stays the same
    expect(state.conversationId).toBe('conv-1');
    // Messages: [U1, A1, U2_edited, A_loading]
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

  it('sends historical edit as a new message without editedMessageId', async () => {
    useChatPanelStore.setState({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'First question',
          timestamp: new Date('2026-03-13T09:00:00.000Z'),
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'First answer',
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

    await useChatPanelStore
      .getState()
      .editMessage('user-1', 'Edited first question', () => 'token');

    // Historical: sent as new message, no editedMessageId
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-1',
      {
        content: 'Edited first question',
        documentIds: undefined,
        editedMessageId: undefined,
      },
      expect.any(Object),
      expect.any(Function)
    );

    const state = useChatPanelStore.getState();
    expect(state.conversationId).toBe('conv-1');
    // Original messages preserved + new user message + assistant loading
    expect(state.messages).toHaveLength(6);
    expect(state.messages[0]!.content).toBe('First question');
    expect(state.messages[4]!.content).toBe('Edited first question');
    expect(state.messages[5]).toMatchObject({
      role: 'assistant',
      isLoading: true,
    });
  });

  it('aborts the pending response before editing the latest unanswered user message', async () => {
    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');

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
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-1',
      {
        content: 'Edited pending question',
        documentIds: undefined,
        editedMessageId: 'user-2',
      },
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('retries the latest assistant message by resending with editedMessageId', async () => {
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

    // Latest pair: resend with editedMessageId
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-1',
      {
        content: 'Question to retry',
        documentIds: undefined,
        editedMessageId: 'user-1',
      },
      expect.any(Object),
      expect.any(Function)
    );

    const state = useChatPanelStore.getState();
    expect(state.conversationId).toBe('conv-1');
    // [U1, A_loading] — old assistant removed, new one added
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]!.content).toBe('Question to retry');
    expect(state.messages[1]).toMatchObject({
      role: 'assistant',
      content: '',
      isLoading: true,
    });
  });

  it('retries a historical assistant message by sending user content as a new message', async () => {
    useChatPanelStore.setState({
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'First question',
          timestamp: new Date('2026-03-13T09:00:00.000Z'),
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'First answer',
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

    await useChatPanelStore.getState().retryMessage('assistant-1', () => 'token');

    // Historical: send as new message, no editedMessageId
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-1',
      {
        content: 'First question',
        documentIds: undefined,
        editedMessageId: undefined,
      },
      expect.any(Object),
      expect.any(Function)
    );

    const state = useChatPanelStore.getState();
    // All original messages preserved + new user + assistant loading
    expect(state.messages).toHaveLength(6);
  });
});
