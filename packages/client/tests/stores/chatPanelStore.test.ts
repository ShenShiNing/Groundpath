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

describe('chatPanelStore sendMessage', () => {
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

  it('ignores blank messages', async () => {
    await useChatPanelStore.getState().sendMessage('   ', () => null);

    expect(chatApiMocks.createConversation).not.toHaveBeenCalled();
    expect(chatApiMocks.sendMessageWithSSE).not.toHaveBeenCalled();
    expect(useChatPanelStore.getState().messages).toHaveLength(0);
  });

  it('adds guidance message when creating conversation fails', async () => {
    chatApiMocks.createConversation.mockRejectedValue(new Error('creation failed'));
    useChatPanelStore.setState({ knowledgeBaseId: 'kb-1' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await useChatPanelStore.getState().sendMessage('How are you?', () => 'token');
    errorSpy.mockRestore();

    expect(chatApiMocks.createConversation).toHaveBeenCalledWith({
      knowledgeBaseId: 'kb-1',
      title: 'How are you?',
    });
    expect(chatApiMocks.sendMessageWithSSE).not.toHaveBeenCalled();

    const state = useChatPanelStore.getState();
    expect(state.conversationId).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]).toMatchObject({
      role: 'user',
      content: 'How are you?',
    });
    expect(state.messages[1]).toMatchObject({
      role: 'assistant',
      isLoading: false,
    });
    expect(state.messages[1]?.content).toContain('error.conversationFailed');
  });

  it('shows the user message and placeholder assistant before conversation creation resolves', async () => {
    let resolveConversation: ((value: { id: string }) => void) | null = null;

    chatApiMocks.createConversation.mockReturnValue(
      new Promise((resolve) => {
        resolveConversation = resolve as (value: { id: string }) => void;
      })
    );
    chatApiMocks.sendMessageWithSSE.mockImplementation(() => new AbortController());

    const sendPromise = useChatPanelStore.getState().sendMessage('Hello', () => 'token');

    const pendingState = useChatPanelStore.getState();
    expect(pendingState.isLoading).toBe(true);
    expect(pendingState.messages).toHaveLength(2);
    expect(pendingState.messages[0]).toMatchObject({
      role: 'user',
      content: 'Hello',
    });
    expect(pendingState.messages[1]).toMatchObject({
      role: 'assistant',
      isLoading: true,
      content: '',
    });

    resolveConversation?.({ id: 'conv-created' });
    await sendPromise;
  });

  it('marks the last assistant message as user_aborted when generation is stopped locally', () => {
    const abort = new AbortController();

    useChatPanelStore.setState({
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'partial answer',
          timestamp: new Date(),
          isLoading: true,
        },
      ],
      abortController: abort,
      isLoading: true,
    });

    useChatPanelStore.getState().stopGeneration();

    const state = useChatPanelStore.getState();
    expect(state.abortController).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.messages[0]).toMatchObject({
      isLoading: false,
      stopReason: 'user_aborted',
    });
  });
});
