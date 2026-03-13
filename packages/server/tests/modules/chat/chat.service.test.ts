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

vi.mock('@core/logger', () => ({
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
  const socket = {
    setTimeout: vi.fn(),
  };
  const res = {
    setHeader: vi.fn(),
    write: vi.fn((data: string) => written.push(data)),
    end: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    headersSent: false,
    socket,
  };
  return { res: res as unknown as import('express').Response, written, socket };
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

  it('disables socket idle timeout for SSE responses', async () => {
    const provider = {
      async *streamGenerate() {
        yield 'Hello';
      },
    };
    mocks.llmService.getProviderForUser.mockResolvedValue(provider);

    const { res, socket } = createMockRes();

    await chatService.sendMessageWithSSE(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hi',
    });

    expect(socket.setTimeout).toHaveBeenCalledWith(0);
  });

  it('persists provider_error and completes SSE when legacy streaming provider throws', async () => {
    const provider = {
      streamGenerate() {
        throw new Error('provider offline');
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
      metadata: expect.objectContaining({
        stopReason: 'provider_error',
      }),
    });
    expect(String(assistantCalls[0]![0].content)).toContain('provider failed');

    const doneEvent = written.find(
      (w) => w.includes('"type":"done"') && w.includes('"stopReason":"provider_error"')
    );
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
      retrievedCitations: [],
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
      retrievedCitations: [
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

  it('passes the abort signal to both provider options and tool context in agent mode', async () => {
    const webTool = { definition: { name: 'web_search', category: 'external' } };
    mocks.resolveTools.mockReturnValue([webTool]);
    mocks.executeAgentLoop.mockResolvedValue({
      content: 'Agent answer',
      citations: [],
      retrievedCitations: [],
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

    const { res } = createMockRes();

    await chatService.sendMessageWithSSE(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hello',
    });

    const loopArgs = mocks.executeAgentLoop.mock.calls[0]![0];
    expect(loopArgs.genOptions.signal).toBeDefined();
    expect(loopArgs.toolContext.signal).toBe(loopArgs.genOptions.signal);
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
      retrievedCitations: [],
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

describe('chatService.sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.conversationService.validateOwnership.mockResolvedValue({
      id: 'conv-1',
      knowledgeBaseId: 'kb-1',
    });
    mocks.messageService.create.mockResolvedValue({ id: 'msg-2' });
    mocks.messageService.count.mockResolvedValue(2);
    mocks.messageService.getRecentForContext.mockResolvedValue([]);
    mocks.promptService.buildSystemPrompt.mockReturnValue('system');
    mocks.promptService.buildAgentSystemPrompt.mockReturnValue('agent-system');
    mocks.promptService.buildChatMessages.mockReturnValue([]);
    mocks.promptService.truncateHistory.mockReturnValue([]);
    mocks.llmService.getOptionsForUser.mockResolvedValue({});
    mocks.conversationRepository.touch.mockResolvedValue(undefined);
    mocks.resolveTools.mockReturnValue([]);
  });

  it('uses agent orchestration for non-streaming when structured tools are available', async () => {
    const outlineTool = { definition: { name: 'outline_search', category: 'structured' } };
    mocks.resolveTools.mockReturnValue([outlineTool]);
    mocks.executeAgentLoop.mockResolvedValue({
      content: 'Structured answer',
      citations: [
        {
          sourceType: 'node',
          nodeId: 'node-1',
          documentId: 'doc-1',
          documentTitle: 'Doc',
          excerpt: 'preview',
        },
      ],
      retrievedCitations: [
        {
          sourceType: 'node',
          nodeId: 'node-1',
          documentId: 'doc-1',
          documentTitle: 'Doc',
          excerpt: 'preview',
        },
      ],
      agentTrace: [{ step: 0 }],
      stopReason: 'answered',
    });
    mocks.llmService.getProviderForUser.mockResolvedValue({
      name: 'test-provider',
      generateWithTools: vi.fn(),
      generate: vi.fn(),
    });

    const result = await chatService.sendMessage({
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Summarize retrieval',
    });

    expect(mocks.executeAgentLoop).toHaveBeenCalledTimes(1);
    expect(mocks.promptService.buildAgentSystemPrompt).toHaveBeenCalledWith({
      hasKnowledgeBase: true,
      hasWebSearch: false,
      hasStructuredKnowledgeBase: true,
    });
    expect(mocks.searchService.searchInKnowledgeBase).not.toHaveBeenCalled();
    expect(mocks.messageService.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: 'Structured answer',
        metadata: expect.objectContaining({
          stopReason: 'answered',
          agentTrace: [{ step: 0 }],
        }),
      })
    );
    expect(result).toEqual({
      messageId: 'msg-2',
      content: 'Structured answer',
      citations: [
        {
          sourceType: 'node',
          nodeId: 'node-1',
          documentId: 'doc-1',
          documentTitle: 'Doc',
          excerpt: 'preview',
        },
      ],
    });
  });

  it('keeps legacy non-streaming path when no agent tools are resolved', async () => {
    mocks.resolveTools.mockReturnValue([]);
    mocks.searchService.searchInKnowledgeBase.mockResolvedValue([
      { documentId: 'doc-1', chunkIndex: 0, content: 'Chunk body', score: 0.9 },
    ]);
    mocks.documentRepository.getTitlesByIds.mockResolvedValue(new Map([['doc-1', 'Doc']]));
    mocks.promptService.toCitations.mockReturnValue([
      {
        sourceType: 'chunk',
        documentId: 'doc-1',
        documentTitle: 'Doc',
        chunkIndex: 0,
        content: 'Chunk body',
        excerpt: 'Chunk body',
      },
    ]);
    mocks.llmService.getProviderForUser.mockResolvedValue({
      generate: vi.fn().mockResolvedValue('Legacy answer'),
    });

    const result = await chatService.sendMessage({
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Legacy path',
    });

    expect(mocks.executeAgentLoop).not.toHaveBeenCalled();
    expect(mocks.searchService.searchInKnowledgeBase).toHaveBeenCalledTimes(1);
    expect(result.content).toBe('Legacy answer');
  });

  it('returns provider_error fallback in legacy non-streaming path when provider.generate fails', async () => {
    mocks.resolveTools.mockReturnValue([]);
    mocks.searchService.searchInKnowledgeBase.mockResolvedValue([]);
    mocks.llmService.getProviderForUser.mockResolvedValue({
      generate: vi.fn().mockRejectedValue(new Error('provider offline')),
    });

    const result = await chatService.sendMessage({
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Legacy path failure',
    });

    expect(result.content).toContain('provider failed');
    expect(mocks.messageService.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        role: 'assistant',
        metadata: expect.objectContaining({
          stopReason: 'provider_error',
        }),
      })
    );
  });
});
