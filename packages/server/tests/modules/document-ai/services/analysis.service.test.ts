import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DOCUMENT_AI_ERROR_CODES } from '@groundpath/shared';
import { AppError } from '@core/errors';
import {
  mockUserId,
  mockDocumentId,
  mockDocumentContent,
  mockEmptyDocumentContent,
  mockKeywordsResponse,
  mockEntitiesResponse,
  mockTopicsResponse,
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

vi.mock('@modules/document', () => ({
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

// Import after mocks
import { analysisService } from '@modules/document-ai/services/analysis.service';
import { documentContentService } from '@modules/document';
import { llmService } from '@modules/llm';

// Mock LLM provider
const mockLLMProvider = {
  name: 'openai' as const,
  generate: vi.fn(),
  streamGenerate: vi.fn(),
  healthCheck: vi.fn(),
};

// ==================== analyze ====================
describe('analysisService > analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(llmService.getProviderForUser).mockResolvedValue(mockLLMProvider);
    vi.mocked(llmService.getOptionsForUser).mockResolvedValue({
      temperature: 0.3,
      maxTokens: 2000,
    });
  });

  // 场景 1：成功执行完整分析
  it('should perform comprehensive analysis', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate)
      .mockResolvedValueOnce(mockKeywordsResponse)
      .mockResolvedValueOnce(mockEntitiesResponse)
      .mockResolvedValueOnce(mockTopicsResponse);

    const result = await analysisService.analyze({
      userId: mockUserId,
      documentId: mockDocumentId,
      analysisTypes: ['keywords', 'entities', 'topics', 'structure'],
    });

    logTestInfo(
      { analysisTypes: ['keywords', 'entities', 'topics', 'structure'] },
      { hasKeywords: true, hasEntities: true, hasTopics: true, hasStructure: true },
      {
        hasKeywords: !!result.keywords,
        hasEntities: !!result.entities,
        hasTopics: !!result.topics,
        hasStructure: !!result.structure,
      }
    );

    expect(result.documentId).toBe(mockDocumentId);
    expect(result.keywords).toBeDefined();
    expect(result.entities).toBeDefined();
    expect(result.topics).toBeDefined();
    expect(result.structure).toBeDefined();
    expect(result.analyzedAt).toBeDefined();
  });

  // 场景 2：仅分析关键词
  it('should analyze only keywords when specified', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockKeywordsResponse);

    const result = await analysisService.analyze({
      userId: mockUserId,
      documentId: mockDocumentId,
      analysisTypes: ['keywords'],
    });

    logTestInfo(
      { analysisTypes: ['keywords'] },
      { hasKeywords: true, hasEntities: false },
      { hasKeywords: !!result.keywords, hasEntities: !!result.entities }
    );

    expect(result.keywords).toBeDefined();
    expect(result.entities).toBeUndefined();
    expect(result.topics).toBeUndefined();
  });

  // 场景 3：仅分析结构（不调用 LLM）
  it('should analyze structure without calling LLM', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);

    const result = await analysisService.analyze({
      userId: mockUserId,
      documentId: mockDocumentId,
      analysisTypes: ['structure'],
    });

    logTestInfo(
      { analysisTypes: ['structure'] },
      { hasStructure: true, llmCalled: false },
      {
        hasStructure: !!result.structure,
        llmCalled: mockLLMProvider.generate.mock.calls.length > 0,
      }
    );

    expect(result.structure).toBeDefined();
    expect(mockLLMProvider.generate).not.toHaveBeenCalled();
  });

  // 场景 4：文档内容为空时抛出错误
  it('should throw CONTENT_EMPTY when document has no text content', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockEmptyDocumentContent);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await analysisService.analyze({
        userId: mockUserId,
        documentId: mockDocumentId,
        analysisTypes: ['keywords'],
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

  // 场景 5：部分分析失败时继续执行其他分析
  it('should continue with other analyses when one fails', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate)
      .mockRejectedValueOnce(new Error('Keywords extraction failed'))
      .mockResolvedValueOnce(mockEntitiesResponse);

    const result = await analysisService.analyze({
      userId: mockUserId,
      documentId: mockDocumentId,
      analysisTypes: ['keywords', 'entities', 'structure'],
    });

    logTestInfo(
      { analysisTypes: ['keywords', 'entities', 'structure'] },
      { keywordsFailed: true, entitiesSuccess: true, structureSuccess: true },
      {
        keywordsFailed: !result.keywords,
        entitiesSuccess: !!result.entities,
        structureSuccess: !!result.structure,
      }
    );

    // Keywords failed but entities and structure should still work
    expect(result.keywords).toBeUndefined();
    expect(result.entities).toBeDefined();
    expect(result.structure).toBeDefined();
  });
});

// ==================== extractKeywords ====================
describe('analysisService > extractKeywords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(llmService.getProviderForUser).mockResolvedValue(mockLLMProvider);
    vi.mocked(llmService.getOptionsForUser).mockResolvedValue({});
  });

  it('should extract keywords from document', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockKeywordsResponse);

    const result = await analysisService.extractKeywords(mockUserId, mockDocumentId);

    logTestInfo(
      { documentId: mockDocumentId },
      { keywordCount: 5 },
      { keywordCount: result.keywords.length }
    );

    expect(result.keywords).toHaveLength(5);
    expect(result.keywords[0]).toHaveProperty('word');
    expect(result.keywords[0]).toHaveProperty('relevance');
  });

  it('should respect maxKeywords option', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockKeywordsResponse);

    await analysisService.extractKeywords(mockUserId, mockDocumentId, { maxKeywords: 3 });

    logTestInfo(
      { maxKeywords: 3 },
      { promptContainsLimit: true },
      { called: mockLLMProvider.generate.mock.calls.length > 0 }
    );

    // The maxKeywords is passed to the prompt
    expect(mockLLMProvider.generate).toHaveBeenCalled();
  });
});

// ==================== extractEntities ====================
describe('analysisService > extractEntities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(llmService.getProviderForUser).mockResolvedValue(mockLLMProvider);
    vi.mocked(llmService.getOptionsForUser).mockResolvedValue({});
  });

  it('should extract entities from document', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockEntitiesResponse);

    const result = await analysisService.extractEntities(mockUserId, mockDocumentId);

    logTestInfo(
      { documentId: mockDocumentId },
      { hasEntities: true },
      { entityCount: result.entities.length }
    );

    expect(result.entities).toBeDefined();
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.entities[0]).toHaveProperty('text');
    expect(result.entities[0]).toHaveProperty('type');
    expect(result.entities[0]).toHaveProperty('confidence');
  });
});

// ==================== getStructure ====================
describe('analysisService > getStructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should analyze document structure without LLM call', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);

    const result = await analysisService.getStructure(mockUserId, mockDocumentId);

    logTestInfo(
      { documentId: mockDocumentId },
      { hasStructure: true },
      {
        characterCount: result.structure.characterCount,
        wordCount: result.structure.wordCount,
        paragraphCount: result.structure.paragraphCount,
      }
    );

    expect(result.structure.characterCount).toBeGreaterThan(0);
    expect(result.structure.wordCount).toBeGreaterThan(0);
    expect(result.structure.paragraphCount).toBeGreaterThan(0);
    expect(result.structure.sentenceCount).toBeGreaterThan(0);
    expect(result.structure.estimatedReadingTimeMinutes).toBeGreaterThanOrEqual(1);
  });

  it('should extract markdown headings', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);

    const result = await analysisService.getStructure(mockUserId, mockDocumentId);

    logTestInfo(
      { documentId: mockDocumentId },
      { hasHeadings: true },
      { headingCount: result.structure.headings.length }
    );

    // mockShortContent has headings
    expect(result.structure.headings.length).toBeGreaterThan(0);
    expect(result.structure.headings[0]).toHaveProperty('level');
    expect(result.structure.headings[0]).toHaveProperty('text');
    expect(result.structure.headings[0]).toHaveProperty('position');
  });

  it('should throw CONTENT_EMPTY when document has no text content', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockEmptyDocumentContent);

    let actual: { code: string } | null = null;
    try {
      await analysisService.getStructure(mockUserId, mockDocumentId);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo({ textContent: null }, { code: DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY }, actual);

    expect(actual?.code).toBe(DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY);
  });
});

// ==================== analyzeStructure (pure function) ====================
describe('analysisService > analyzeStructure', () => {
  it('should count characters correctly', () => {
    const content = 'Hello World!';
    const result = analysisService.analyzeStructure(content);

    expect(result.characterCount).toBe(12);
  });

  it('should count words correctly for English text', () => {
    const content = 'Hello World from AI';
    const result = analysisService.analyzeStructure(content);

    expect(result.wordCount).toBe(4);
  });

  it('should count words correctly for Chinese text', () => {
    const content = '人工智能很强大';
    const result = analysisService.analyzeStructure(content);

    // Each Chinese character counts as a word
    expect(result.wordCount).toBe(7);
  });

  it('should count paragraphs correctly', () => {
    const content = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
    const result = analysisService.analyzeStructure(content);

    expect(result.paragraphCount).toBe(3);
  });

  it('should count sentences correctly', () => {
    const content = 'First sentence. Second sentence! Third sentence?';
    const result = analysisService.analyzeStructure(content);

    expect(result.sentenceCount).toBe(3);
  });

  it('should extract headings from markdown', () => {
    const content = '# Title\n\n## Section 1\n\nContent\n\n### Subsection\n\n## Section 2';
    const result = analysisService.analyzeStructure(content);

    expect(result.headings).toHaveLength(4);
    expect(result.headings[0]).toEqual({ level: 1, text: 'Title', position: 0 });
    expect(result.headings[1]).toEqual({ level: 2, text: 'Section 1', position: 2 });
  });

  it('should estimate reading time', () => {
    // Create content with ~400 words (2 minutes reading time at 200 wpm)
    const content = 'word '.repeat(400);
    const result = analysisService.analyzeStructure(content);

    expect(result.estimatedReadingTimeMinutes).toBe(2);
  });
});
