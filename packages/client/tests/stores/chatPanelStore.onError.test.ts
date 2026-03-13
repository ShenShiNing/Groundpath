import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SSEHandlers } from '@/api/chat';
import type { StreamControls } from '@/stores/chatPanelStore.types';

let capturedHandlers: SSEHandlers | null = null;

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

describe('chatPanelStore onError handling', () => {
  function createBufferedStream(): StreamControls {
    let buffer = '';

    return {
      push: (text: string) => {
        buffer += text;
      },
      flush: () => {
        if (!buffer) return;
        const nextText = buffer;
        buffer = '';
        useChatPanelStore.getState().appendToLastMessage(nextText);
      },
      reset: () => {
        buffer = '';
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandlers = null;

    useChatPanelStore.setState({
      isOpen: false,
      knowledgeBaseId: 'kb-1',
      conversationId: 'conv-1',
      messages: [],
      selectedDocumentIds: [],
      isLoading: false,
      abortController: null,
      showSidebar: false,
    });

    chatApiMocks.sendMessageWithSSE.mockImplementation(
      (_convId: string, _data: unknown, handlers: SSEHandlers) => {
        capturedHandlers = handlers;
        return new AbortController();
      }
    );
  });

  it('maps unreadable saved api key errors to the settings guidance message', async () => {
    await useChatPanelStore.getState().sendMessage('Hello', () => 'token');

    capturedHandlers!.onError({
      code: 'LLM_DECRYPTION_FAILED',
      message: 'Saved API key can no longer be decrypted. Please update it in AI Settings.',
    });

    const state = useChatPanelStore.getState();
    expect(state.messages[1]?.content).toContain('error.llmApiKeyUnreadable');
    expect(state.messages[1]?.isLoading).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('flushes buffered chunk content before handling stream errors', async () => {
    const stream = createBufferedStream();

    await useChatPanelStore.getState().sendMessage('Hello', () => 'token', stream);

    capturedHandlers!.onChunk('Partial answer');
    capturedHandlers!.onError({
      code: 'UNEXPECTED_ERROR',
      message: 'stream failed',
    });

    const state = useChatPanelStore.getState();
    expect(state.messages[1]?.content).toBe('Partial answer');
    expect(state.messages[1]?.isLoading).toBe(false);
    expect(state.isLoading).toBe(false);
  });
});
