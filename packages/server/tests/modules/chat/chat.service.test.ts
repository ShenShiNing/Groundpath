import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  conversationService: {
    validateOwnership: vi.fn(),
    generateTitle: vi.fn(),
  },
  messageService: {
    create: vi.fn(),
    count: vi.fn(),
    getRecentForContext: vi.fn(),
  },
  promptService: {
    buildSystemPrompt: vi.fn(),
    buildChatMessages: vi.fn(),
    truncateHistory: vi.fn(),
    toCitations: vi.fn(),
  },
  conversationRepository: {
    update: vi.fn(),
    touch: vi.fn(),
  },
  llmService: {
    getProviderForUser: vi.fn(),
    getOptionsForUser: vi.fn(),
  },
  searchService: {
    searchInKnowledgeBase: vi.fn(),
  },
  documentRepository: {
    getTitlesByIds: vi.fn(),
  },
}));

vi.mock('@modules/chat/services/conversation.service', () => ({
  conversationService: mocks.conversationService,
}));

vi.mock('@modules/chat/services/message.service', () => ({
  messageService: mocks.messageService,
}));

vi.mock('@modules/chat/services/prompt.service', () => ({
  promptService: mocks.promptService,
}));

vi.mock('@modules/chat/repositories/conversation.repository', () => ({
  conversationRepository: mocks.conversationRepository,
}));

vi.mock('@modules/llm', () => ({
  llmService: mocks.llmService,
}));

vi.mock('@modules/rag', () => ({
  searchService: mocks.searchService,
}));

vi.mock('@modules/document', () => ({
  documentRepository: mocks.documentRepository,
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { chatService } from '@modules/chat/services/chat.service';

function createMockRes() {
  const written: string[] = [];
  const res = {
    setHeader: vi.fn(),
    write: vi.fn((data: string) => written.push(data)),
    end: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    headersSent: false,
  };
  return { res: res as unknown as import('express').Response, written };
}

describe('chatService.sendMessageWithSSE', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.conversationService.validateOwnership.mockResolvedValue({
      id: 'conv-1',
      knowledgeBaseId: null,
    });
    mocks.messageService.create.mockResolvedValue({ id: 'msg-1' });
    mocks.messageService.count.mockResolvedValue(2);
    mocks.messageService.getRecentForContext.mockResolvedValue([]);
    mocks.promptService.buildSystemPrompt.mockReturnValue('system');
    mocks.promptService.buildChatMessages.mockReturnValue([]);
    mocks.promptService.truncateHistory.mockReturnValue([]);
    mocks.llmService.getOptionsForUser.mockResolvedValue({});
  });

  it('sends error SSE when LLM returns empty content', async () => {
    // Provider that yields nothing (empty stream)
    const emptyProvider = {
      async *streamGenerate() {
        // yields nothing
      },
    };
    mocks.llmService.getProviderForUser.mockResolvedValue(emptyProvider);

    const { res, written } = createMockRes();

    await chatService.sendMessageWithSSE(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hello',
    });

    // Should NOT save assistant message
    const createCalls = mocks.messageService.create.mock.calls;
    const assistantCalls = createCalls.filter(
      (call: [{ role: string }]) => call[0]?.role === 'assistant'
    );
    expect(assistantCalls).toHaveLength(0);

    // Should send error SSE event
    const errorEvent = written.find((w) => w.includes('STREAMING_FAILED'));
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toContain('empty response');

    // Should end response
    expect(res.end).toHaveBeenCalled();
  });

  it('saves and sends done when LLM returns non-empty content', async () => {
    const provider = {
      async *streamGenerate() {
        yield 'Hello';
        yield ' world';
      },
    };
    mocks.llmService.getProviderForUser.mockResolvedValue(provider);

    const { res, written } = createMockRes();

    await chatService.sendMessageWithSSE(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hi',
    });

    // Should save assistant message
    const createCalls = mocks.messageService.create.mock.calls;
    const assistantCalls = createCalls.filter(
      (call: [{ role: string }]) => call[0]?.role === 'assistant'
    );
    expect(assistantCalls).toHaveLength(1);
    expect(assistantCalls[0]![0]).toMatchObject({
      role: 'assistant',
      content: 'Hello world',
    });

    // Should send done event
    const doneEvent = written.find((w) => w.includes('"type":"done"'));
    expect(doneEvent).toBeDefined();
  });
});
