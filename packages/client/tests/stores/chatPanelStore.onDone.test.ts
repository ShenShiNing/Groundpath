import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SSEHandlers } from '@/api/chat';

// Capture SSE handlers passed to sendMessageWithSSE
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

describe('chatPanelStore onDone empty content guard', () => {
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

  it('shows fallback message when onDone fires with empty assistant content', async () => {
    await useChatPanelStore.getState().sendMessage('Hello', () => 'token');

    // At this point there should be a user message and a loading assistant message
    const stateAfterSend = useChatPanelStore.getState();
    expect(stateAfterSend.messages).toHaveLength(2);
    expect(stateAfterSend.messages[1]?.content).toBe('');

    // Simulate onDone with empty content still in assistant message
    capturedHandlers!.onDone({ messageId: 'msg-server-1' });

    const finalState = useChatPanelStore.getState();
    expect(finalState.messages[1]?.content).toContain('error.emptyResponse');
    expect(finalState.messages[1]?.isLoading).toBe(false);
    expect(finalState.isLoading).toBe(false);
  });

  it('preserves content when onDone fires with non-empty assistant content', async () => {
    await useChatPanelStore.getState().sendMessage('Hello', () => 'token');

    // Simulate receiving a chunk before done
    capturedHandlers!.onChunk('Real answer');

    capturedHandlers!.onDone({ messageId: 'msg-server-2' });

    const finalState = useChatPanelStore.getState();
    expect(finalState.messages[1]?.content).toBe('Real answer');
    expect(finalState.messages[1]?.id).toBe('msg-server-2');
    expect(finalState.messages[1]?.isLoading).toBe(false);
  });
});
