import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DOCUMENT_AI_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@core/errors';
import {
  mockUserId,
  mockDocumentId,
  mockKnowledgeBaseId,
  mockDocumentContent,
  mockEmptyDocumentContent,
  mockGenerationResponse,
  mockExpandResponse,
  mockSearchResults,
  logTestInfo,
} from '@tests/__mocks__/document-ai.mocks';

// ==================== Mocks ====================

vi.mock('@core/logger', () => ({
  createLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('@modules/document/services/content', () => ({
  documentContentService: {
    getContent: vi.fn(),
  },
}));

vi.mock('@modules/llm', () => ({
  llmService: {
    getProviderForUser: vi.fn(),
    getOptionsForUser: vi.fn(),
  },
}));

vi.mock('@modules/rag/services', () => ({
  searchService: {
    searchInKnowledgeBase: vi.fn(),
  },
}));

// Import after mocks
import { generationService } from '@modules/document-ai/services/generation.service';
import { documentContentService } from '@modules/document/services/content';
import { llmService } from '@modules/llm';
import { searchService } from '@modules/rag/services';

// Mock LLM provider
const mockLLMProvider = {
  name: 'openai' as const,
  generate: vi.fn(),
  streamGenerate: vi.fn(),
  healthCheck: vi.fn(),
};

// ==================== generate ====================
describe('generationService > generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(llmService.getProviderForUser).mockResolvedValue(mockLLMProvider);
    vi.mocked(llmService.getOptionsForUser).mockResolvedValue({
      temperature: 0.7,
      maxTokens: 4000,
    });
  });

  // 场景 1：成功生成内容
  it('should generate content from prompt', async () => {
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockGenerationResponse);

    const result = await generationService.generate({
      userId: mockUserId,
      prompt: '写一篇关于人工智能的文章',
      style: 'formal',
    });

    logTestInfo(
      { prompt: '写一篇关于人工智能的文章', style: 'formal' },
      { hasContent: true, hasWordCount: true },
      { hasContent: !!result.content, wordCount: result.wordCount }
    );

    expect(result.content).toBe(mockGenerationResponse);
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.style).toBe('formal');
    expect(result.generatedAt).toBeDefined();
    expect(mockLLMProvider.generate).toHaveBeenCalled();
  });

  // 场景 2：支持不同模板类型
  it.each(['report', 'email', 'article', 'outline', 'summary'] as const)(
    'should support %s template',
    async (template) => {
      vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockGenerationResponse);

      const result = await generationService.generate({
        userId: mockUserId,
        prompt: '生成测试内容',
        template,
      });

      logTestInfo(
        { template },
        { success: true, template },
        { success: !!result.content, template: result.template }
      );

      expect(result.content).toBeDefined();
      expect(result.template).toBe(template);
    }
  );

  // 场景 3：支持不同写作风格
  it.each(['formal', 'casual', 'technical', 'creative', 'academic'] as const)(
    'should support %s style',
    async (style) => {
      vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockGenerationResponse);

      const result = await generationService.generate({
        userId: mockUserId,
        prompt: '生成测试内容',
        style,
      });

      logTestInfo(
        { style },
        { success: true, style },
        { success: !!result.content, style: result.style }
      );

      expect(result.content).toBeDefined();
      expect(result.style).toBe(style);
    }
  );

  // 场景 4：RAG 增强生成
  it('should use RAG context when knowledgeBaseId is provided', async () => {
    vi.mocked(searchService.searchInKnowledgeBase).mockResolvedValue(mockSearchResults);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockGenerationResponse);

    const result = await generationService.generate({
      userId: mockUserId,
      prompt: '基于知识库生成内容',
      knowledgeBaseId: mockKnowledgeBaseId,
    });

    logTestInfo(
      { knowledgeBaseId: mockKnowledgeBaseId },
      { ragCalled: true, hasContent: true },
      {
        ragCalled: vi.mocked(searchService.searchInKnowledgeBase).mock.calls.length > 0,
        hasContent: !!result.content,
      }
    );

    expect(searchService.searchInKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mockUserId,
        knowledgeBaseId: mockKnowledgeBaseId,
      })
    );
    expect(result.content).toBeDefined();
  });

  // 场景 5：RAG 搜索失败时继续生成
  it('should continue generation when RAG search fails', async () => {
    vi.mocked(searchService.searchInKnowledgeBase).mockRejectedValue(new Error('Search failed'));
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockGenerationResponse);

    const result = await generationService.generate({
      userId: mockUserId,
      prompt: '基于知识库生成内容',
      knowledgeBaseId: mockKnowledgeBaseId,
    });

    logTestInfo(
      { knowledgeBaseId: mockKnowledgeBaseId, searchFailed: true },
      { generationSucceeded: true },
      { generationSucceeded: !!result.content }
    );

    // Should still generate content even if RAG fails
    expect(result.content).toBeDefined();
  });

  // 场景 6：支持指定最大长度
  it('should pass maxLength to prompt builder', async () => {
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockGenerationResponse);

    const result = await generationService.generate({
      userId: mockUserId,
      prompt: '生成测试内容',
      maxLength: 2000,
    });

    logTestInfo({ maxLength: 2000 }, { success: true }, { success: !!result.content });

    expect(result.content).toBeDefined();
    expect(mockLLMProvider.generate).toHaveBeenCalled();
  });
});

// ==================== expand ====================
describe('generationService > expand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(llmService.getProviderForUser).mockResolvedValue(mockLLMProvider);
    vi.mocked(llmService.getOptionsForUser).mockResolvedValue({
      temperature: 0.7,
      maxTokens: 4000,
    });
  });

  // 场景 1：成功扩展文档（添加到后面）
  it('should expand document with after position', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockExpandResponse);

    const result = await generationService.expand({
      userId: mockUserId,
      documentId: mockDocumentId,
      instruction: '添加关于伦理问题的讨论',
      position: 'after',
    });

    logTestInfo(
      { documentId: mockDocumentId, position: 'after' },
      { hasContent: true, position: 'after' },
      { hasContent: !!result.content, position: result.position }
    );

    expect(result.content).toBe(mockExpandResponse);
    expect(result.position).toBe('after');
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.generatedAt).toBeDefined();
  });

  // 场景 2：支持不同扩展位置
  it.each(['before', 'after', 'replace'] as const)(
    'should support %s position',
    async (position) => {
      vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
      vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockExpandResponse);

      const result = await generationService.expand({
        userId: mockUserId,
        documentId: mockDocumentId,
        instruction: '扩展内容',
        position,
      });

      logTestInfo(
        { position },
        { success: true, position },
        { success: !!result.content, position: result.position }
      );

      expect(result.content).toBeDefined();
      expect(result.position).toBe(position);
    }
  );

  // 场景 3：文档内容为空时抛出错误
  it('should throw CONTENT_EMPTY when document has no text content', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockEmptyDocumentContent);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await generationService.expand({
        userId: mockUserId,
        documentId: mockDocumentId,
        instruction: '扩展内容',
        position: 'after',
      });
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    logTestInfo(
      { documentId: mockDocumentId, textContent: null },
      { code: DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY, statusCode: 400 },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 4：支持 RAG 增强扩展
  it('should use RAG context when knowledgeBaseId is provided', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(searchService.searchInKnowledgeBase).mockResolvedValue(mockSearchResults);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockExpandResponse);

    const result = await generationService.expand({
      userId: mockUserId,
      documentId: mockDocumentId,
      instruction: '基于知识库扩展',
      position: 'after',
      knowledgeBaseId: mockKnowledgeBaseId,
    });

    logTestInfo(
      { knowledgeBaseId: mockKnowledgeBaseId },
      { ragCalled: true, hasContent: true },
      {
        ragCalled: vi.mocked(searchService.searchInKnowledgeBase).mock.calls.length > 0,
        hasContent: !!result.content,
      }
    );

    expect(searchService.searchInKnowledgeBase).toHaveBeenCalled();
    expect(result.content).toBeDefined();
  });

  // 场景 5：支持指定写作风格
  it('should pass style to prompt builder', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockExpandResponse);

    const result = await generationService.expand({
      userId: mockUserId,
      documentId: mockDocumentId,
      instruction: '扩展内容',
      position: 'after',
      style: 'technical',
    });

    logTestInfo({ style: 'technical' }, { success: true }, { success: !!result.content });

    expect(result.content).toBeDefined();
    expect(mockLLMProvider.generate).toHaveBeenCalled();
  });
});

// ==================== Prompt Building Tests ====================
describe('generationService > prompt building', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(llmService.getProviderForUser).mockResolvedValue(mockLLMProvider);
    vi.mocked(llmService.getOptionsForUser).mockResolvedValue({});
  });

  it('should build correct message structure for generate', async () => {
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockGenerationResponse);

    await generationService.generate({
      userId: mockUserId,
      prompt: 'Test prompt',
      style: 'formal',
    });

    const [messages] = mockLLMProvider.generate.mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];

    logTestInfo(
      { prompt: 'Test prompt' },
      { messageCount: 2, hasSystem: true, hasUser: true },
      {
        messageCount: messages.length,
        hasSystem: messages.some((m) => m.role === 'system'),
        hasUser: messages.some((m) => m.role === 'user'),
      }
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
  });

  it('should build correct message structure for expand', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockExpandResponse);

    await generationService.expand({
      userId: mockUserId,
      documentId: mockDocumentId,
      instruction: 'Expand instruction',
      position: 'after',
    });

    const [messages] = mockLLMProvider.generate.mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];

    logTestInfo(
      { instruction: 'Expand instruction' },
      { messageCount: 2, userContainsExistingContent: true },
      {
        messageCount: messages.length,
        userContainsExistingContent: messages[1]?.content.includes('人工智能') || false,
      }
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
    // User message should contain the existing document content
    expect(messages[1]?.content).toContain('人工智能');
  });
});
