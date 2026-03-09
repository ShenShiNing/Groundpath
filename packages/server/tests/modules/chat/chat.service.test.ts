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
    buildAgentSystemPrompt: vi.fn(),
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
  resolveTools: vi.fn(),
  executeAgentLoop: vi.fn(),
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

vi.mock('@modules/agent', () => ({
  resolveTools: mocks.resolveTools,
  executeAgentLoop: mocks.executeAgentLoop,
}));

vi.mock('@shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
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
    mocks.promptService.buildAgentSystemPrompt.mockReturnValue('agent-system');
    mocks.promptService.buildChatMessages.mockReturnValue([]);
    mocks.promptService.truncateHistory.mockReturnValue([]);
    mocks.llmService.getOptionsForUser.mockResolvedValue({});
    mocks.resolveTools.mockReturnValue([]);
  });

  // --- Legacy streaming mode ---

  it('sends error SSE when LLM returns empty content', async () => {
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

    const createCalls = mocks.messageService.create.mock.calls;
    const assistantCalls = createCalls.filter((call) => call[0]?.role === 'assistant');
    expect(assistantCalls).toHaveLength(0);

    const errorEvent = written.find((w) => w.includes('STREAMING_FAILED'));
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toContain('empty response');
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

    const createCalls = mocks.messageService.create.mock.calls;
    const assistantCalls = createCalls.filter((call) => call[0]?.role === 'assistant');
    expect(assistantCalls).toHaveLength(1);
    expect(assistantCalls[0]![0]).toMatchObject({
      role: 'assistant',
      content: 'Hello world',
    });

    const doneEvent = written.find((w) => w.includes('"type":"done"'));
    expect(doneEvent).toBeDefined();
  });

  it('uses legacy streaming when no tools are available', async () => {
    mocks.resolveTools.mockReturnValue([]);
    const provider = {
      generateWithTools: vi.fn(),
      async *streamGenerate() {
        yield 'answer';
      },
    };
    mocks.llmService.getProviderForUser.mockResolvedValue(provider);

    const { res } = createMockRes();

    await chatService.sendMessageWithSSE(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hi',
    });

    // Should NOT call agent loop
    expect(mocks.executeAgentLoop).not.toHaveBeenCalled();
    // Should use legacy system prompt
    expect(mocks.promptService.buildSystemPrompt).toHaveBeenCalled();
    expect(mocks.promptService.buildAgentSystemPrompt).not.toHaveBeenCalled();
  });

  // --- Agent mode ---

  it('enters agent mode when tools available and provider supports tool calling', async () => {
    const kbTool = { definition: { name: 'knowledge_base_search', category: 'fallback' } };
    mocks.resolveTools.mockReturnValue([kbTool]);
    mocks.executeAgentLoop.mockResolvedValue({
      content: 'Agent answer',
      citations: [],
      agentTrace: [],
      stopReason: 'answered',
    });
    const provider = {
      name: 'test-provider',
      generateWithTools: vi.fn(),
      async *streamGenerate() {
        yield 'fallback';
      },
    };
    mocks.llmService.getProviderForUser.mockResolvedValue(provider);
    mocks.conversationService.validateOwnership.mockResolvedValue({
      id: 'conv-1',
      knowledgeBaseId: 'kb-1',
    });

    const { res, written } = createMockRes();

    await chatService.sendMessageWithSSE(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Search my docs',
    });

    // Should call agent loop
    expect(mocks.executeAgentLoop).toHaveBeenCalledTimes(1);
    // Should use agent system prompt with KB flag
    expect(mocks.promptService.buildAgentSystemPrompt).toHaveBeenCalledWith({
      hasKnowledgeBase: true,
      hasWebSearch: false,
      hasStructuredKnowledgeBase: false,
    });
    // Should save assistant message with agent content
    const createCalls = mocks.messageService.create.mock.calls;
    const assistantCalls = createCalls.filter((call) => call[0]?.role === 'assistant');
    expect(assistantCalls).toHaveLength(1);
    expect(assistantCalls[0]![0]).toMatchObject({
      role: 'assistant',
      content: 'Agent answer',
    });

    const doneEvent = written.find((w) => w.includes('"type":"done"'));
    expect(doneEvent).toBeDefined();
  });

  it('passes all resolved tools to agent loop (KB + web)', async () => {
    const kbTool = { definition: { name: 'outline_search', category: 'structured' } };
    const webTool = { definition: { name: 'web_search', category: 'external' } };
    mocks.resolveTools.mockReturnValue([kbTool, webTool]);
    mocks.executeAgentLoop.mockResolvedValue({
      content: 'Combined answer',
      citations: [
        {
          sourceType: 'chunk',
          documentId: 'doc-1',
          documentTitle: 'Test',
          chunkIndex: 0,
          content: 'c',
          score: 0.9,
        },
      ],
      agentTrace: [{ step: 0 }],
      stopReason: 'answered',
    });
    const provider = {
      name: 'test-provider',
      generateWithTools: vi.fn(),
      async *streamGenerate() {
        yield 'fallback';
      },
    };
    mocks.llmService.getProviderForUser.mockResolvedValue(provider);
    mocks.conversationService.validateOwnership.mockResolvedValue({
      id: 'conv-1',
      knowledgeBaseId: 'kb-1',
    });

    const { res, written } = createMockRes();

    await chatService.sendMessageWithSSE(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Search everything',
    });

    // Agent loop receives both tools
    const loopArgs = mocks.executeAgentLoop.mock.calls[0]![0];
    expect(loopArgs.tools).toHaveLength(2);
    expect(loopArgs.tools).toEqual([kbTool, webTool]);

    // System prompt reflects both tools
    expect(mocks.promptService.buildAgentSystemPrompt).toHaveBeenCalledWith({
      hasKnowledgeBase: true,
      hasWebSearch: true,
      hasStructuredKnowledgeBase: true,
    });

    // Citations sent via SSE
    const sourcesEvent = written.find((w) => w.includes('"type":"sources"'));
    expect(sourcesEvent).toBeDefined();

    // Agent trace saved in metadata
    const createCalls = mocks.messageService.create.mock.calls;
    const assistantCalls = createCalls.filter((call) => call[0]?.role === 'assistant');
    expect(assistantCalls[0]![0].metadata.agentTrace).toBeDefined();
  });

  it('falls back to legacy streaming when provider lacks generateWithTools', async () => {
    const kbTool = { definition: { name: 'knowledge_base_search', category: 'fallback' } };
    mocks.resolveTools.mockReturnValue([kbTool]);
    // Provider WITHOUT generateWithTools
    const provider = {
      async *streamGenerate() {
        yield 'streaming answer';
      },
    };
    mocks.llmService.getProviderForUser.mockResolvedValue(provider);

    const { res } = createMockRes();

    await chatService.sendMessageWithSSE(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hello',
    });

    expect(mocks.executeAgentLoop).not.toHaveBeenCalled();
    expect(mocks.promptService.buildSystemPrompt).toHaveBeenCalled();
  });

  it('sends error SSE when agent returns empty content', async () => {
    const webTool = { definition: { name: 'web_search', category: 'external' } };
    mocks.resolveTools.mockReturnValue([webTool]);
    mocks.executeAgentLoop.mockResolvedValue({
      content: '   ',
      citations: [],
      agentTrace: [],
      stopReason: 'answered',
    });
    const provider = {
      name: 'test-provider',
      generateWithTools: vi.fn(),
      async *streamGenerate() {
        yield 'fallback';
      },
    };
    mocks.llmService.getProviderForUser.mockResolvedValue(provider);

    const { res, written } = createMockRes();

    await chatService.sendMessageWithSSE(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hello',
    });

    const errorEvent = written.find((w) => w.includes('STREAMING_FAILED'));
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toContain('empty response');

    const createCalls = mocks.messageService.create.mock.calls;
    const assistantCalls = createCalls.filter((call) => call[0]?.role === 'assistant');
    expect(assistantCalls).toHaveLength(0);
  });
});
