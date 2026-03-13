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

// Real DB-style UUIDs for messages that have been persisted
const U1 = '11111111-1111-1111-1111-111111111111';
const A1 = '22222222-2222-2222-2222-222222222222';
const U2 = '33333333-3333-3333-3333-333333333333';
const A2 = '44444444-4444-4444-4444-444444444444';

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
          id: U1,
          role: 'user',
          content: 'Original question',
          timestamp: new Date('2026-03-13T09:00:00.000Z'),
        },
        {
          id: A1,
          role: 'assistant',
          content: 'Original answer',
          timestamp: new Date('2026-03-13T09:01:00.000Z'),
        },
        {
          id: U2,
          role: 'user',
          content: 'Second question',
          timestamp: new Date('2026-03-13T09:02:00.000Z'),
        },
        {
          id: A2,
          role: 'assistant',
          content: 'Second answer',
          timestamp: new Date('2026-03-13T09:03:00.000Z'),
        },
      ],
    });

    await useChatPanelStore.getState().editMessage(U2, 'Edited question', () => 'token');

    // Should NOT fork — send directly with editedMessageId
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-1',
      { content: 'Edited question', documentIds: ['doc-1'], editedMessageId: U2 },
      expect.any(Object),
      expect.any(Function)
    );

    const state = useChatPanelStore.getState();
    expect(state.conversationId).toBe('conv-1');
    // Messages: [U1, A1, U2_edited, A_loading]
    expect(state.messages).toHaveLength(4);
    expect(state.messages.map((m) => m.content)).toEqual([
      'Original question',
      'Original answer',
      'Edited question',
      '',
    ]);
    expect(state.messages[3]).toMatchObject({ role: 'assistant', isLoading: true });
  });

  it('sends historical edit as a new message without editedMessageId', async () => {
    useChatPanelStore.setState({
      messages: [
        {
          id: U1,
          role: 'user',
          content: 'First question',
          timestamp: new Date('2026-03-13T09:00:00.000Z'),
        },
        {
          id: A1,
          role: 'assistant',
          content: 'First answer',
          timestamp: new Date('2026-03-13T09:01:00.000Z'),
        },
        {
          id: U2,
          role: 'user',
          content: 'Second question',
          timestamp: new Date('2026-03-13T09:02:00.000Z'),
        },
        {
          id: A2,
          role: 'assistant',
          content: 'Second answer',
          timestamp: new Date('2026-03-13T09:03:00.000Z'),
        },
      ],
    });

    await useChatPanelStore.getState().editMessage(U1, 'Edited first question', () => 'token');

    // Historical: sent as new message, no editedMessageId
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-1',
      { content: 'Edited first question', documentIds: undefined, editedMessageId: undefined },
      expect.any(Object),
      expect.any(Function)
    );

    const state = useChatPanelStore.getState();
    expect(state.conversationId).toBe('conv-1');
    // Original messages preserved + new user message + assistant loading
    expect(state.messages).toHaveLength(6);
    expect(state.messages[0]!.content).toBe('First question');
    expect(state.messages[4]!.content).toBe('Edited first question');
    expect(state.messages[5]).toMatchObject({ role: 'assistant', isLoading: true });
  });

  it('aborts the pending response and resends without editedMessageId (temp id)', async () => {
    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');

    // Temp IDs: onDone has not fired yet, so IDs start with 'user-'
    useChatPanelStore.setState({
      isLoading: true,
      abortController,
      messages: [
        {
          id: U1,
          role: 'user',
          content: 'Original question',
          timestamp: new Date('2026-03-13T09:00:00.000Z'),
        },
        {
          id: 'user-1710000000000',
          role: 'user',
          content: 'Pending question',
          timestamp: new Date('2026-03-13T09:01:00.000Z'),
        },
        {
          id: 'assistant-1710000000001',
          role: 'assistant',
          content: '',
          timestamp: new Date('2026-03-13T09:01:30.000Z'),
          isLoading: true,
        },
      ],
    });

    await useChatPanelStore
      .getState()
      .editMessage('user-1710000000000', 'Edited pending question', () => 'token');

    expect(abortSpy).toHaveBeenCalledTimes(1);
    // Temp ID → falls back to sending as new message (no editedMessageId)
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-1',
      { content: 'Edited pending question', documentIds: undefined, editedMessageId: undefined },
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('retries the latest assistant message by resending with editedMessageId', async () => {
    useChatPanelStore.setState({
      messages: [
        {
          id: U1,
          role: 'user',
          content: 'Question to retry',
          timestamp: new Date('2026-03-13T09:00:00.000Z'),
        },
        {
          id: A1,
          role: 'assistant',
          content: 'Answer to retry',
          timestamp: new Date('2026-03-13T09:01:00.000Z'),
        },
      ],
    });

    await useChatPanelStore.getState().retryMessage(A1, () => 'token');

    // Latest pair: resend with editedMessageId
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-1',
      { content: 'Question to retry', documentIds: undefined, editedMessageId: U1 },
      expect.any(Object),
      expect.any(Function)
    );

    const state = useChatPanelStore.getState();
    expect(state.conversationId).toBe('conv-1');
    // [U1, A_loading]
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]!.content).toBe('Question to retry');
    expect(state.messages[1]).toMatchObject({ role: 'assistant', content: '', isLoading: true });
  });

  it('retries a historical assistant message by sending user content as a new message', async () => {
    useChatPanelStore.setState({
      messages: [
        {
          id: U1,
          role: 'user',
          content: 'First question',
          timestamp: new Date('2026-03-13T09:00:00.000Z'),
        },
        {
          id: A1,
          role: 'assistant',
          content: 'First answer',
          timestamp: new Date('2026-03-13T09:01:00.000Z'),
        },
        {
          id: U2,
          role: 'user',
          content: 'Second question',
          timestamp: new Date('2026-03-13T09:02:00.000Z'),
        },
        {
          id: A2,
          role: 'assistant',
          content: 'Second answer',
          timestamp: new Date('2026-03-13T09:03:00.000Z'),
        },
      ],
    });

    await useChatPanelStore.getState().retryMessage(A1, () => 'token');

    // Historical: send as new message, no editedMessageId
    expect(chatApiMocks.sendMessageWithSSE).toHaveBeenCalledWith(
      'conv-1',
      { content: 'First question', documentIds: undefined, editedMessageId: undefined },
      expect.any(Object),
      expect.any(Function)
    );

    const state = useChatPanelStore.getState();
    // All original messages preserved + new user + assistant loading
    expect(state.messages).toHaveLength(6);
  });
});
