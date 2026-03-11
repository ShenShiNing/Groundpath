import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DOCUMENT_AI_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@shared/errors';
import {
  mockUserId,
  mockDocumentId,
  mockDocumentContent,
  mockLongDocumentContent,
  mockEmptyDocumentContent,
  mockSummaryResponse,
  logTestInfo,
} from '@tests/__mocks__/document-ai.mocks';

// ==================== Mocks ====================

vi.mock('@shared/logger', () => ({
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
import { summaryService } from '@modules/document-ai/services/summary.service';
import { documentContentService } from '@modules/document';
import { llmService } from '@modules/llm';

// Mock LLM provider
const mockLLMProvider = {
  name: 'openai' as const,
  generate: vi.fn(),
  streamGenerate: vi.fn(),
  healthCheck: vi.fn(),
};

// ==================== generateSummary ====================
describe('summaryService > generateSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock provider
    vi.mocked(mockLLMProvider.generate).mockReset();
    vi.mocked(llmService.getProviderForUser).mockResolvedValue(mockLLMProvider);
    vi.mocked(llmService.getOptionsForUser).mockResolvedValue({
      temperature: 0.7,
      maxTokens: 2000,
    });
  });

  // 场景 1：成功生成短文档摘要
  it('should generate summary for short document', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockSummaryResponse);

    const result = await summaryService.generateSummary({
      userId: mockUserId,
      documentId: mockDocumentId,
      length: 'medium',
    });

    logTestInfo(
      { documentId: mockDocumentId, length: 'medium' },
      { hasSummary: true, hasWordCount: true },
      { hasSummary: !!result.summary, hasWordCount: result.wordCount > 0 }
    );

    expect(result.summary).toBe(mockSummaryResponse);
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.generatedAt).toBeDefined();
    expect(documentContentService.getContent).toHaveBeenCalledWith(mockDocumentId, mockUserId);
    expect(mockLLMProvider.generate).toHaveBeenCalled();
  });

  // 场景 2：支持不同摘要长度
  it.each(['short', 'medium', 'detailed'] as const)(
    'should support %s summary length',
    async (length) => {
      vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
      vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockSummaryResponse);

      const result = await summaryService.generateSummary({
        userId: mockUserId,
        documentId: mockDocumentId,
        length,
      });

      logTestInfo({ length }, { success: true }, { success: !!result.summary });

      expect(result.summary).toBeDefined();
      expect(mockLLMProvider.generate).toHaveBeenCalled();
    }
  );

  // 场景 3：文档内容为空时抛出错误
  it('should throw CONTENT_EMPTY when document has no text content', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockEmptyDocumentContent);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await summaryService.generateSummary({
        userId: mockUserId,
        documentId: mockDocumentId,
        length: 'medium',
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

  // 场景 4：支持指定语言
  it('should pass language option to prompts', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockSummaryResponse);

    const result = await summaryService.generateSummary({
      userId: mockUserId,
      documentId: mockDocumentId,
      length: 'medium',
      language: 'en',
    });

    logTestInfo(
      { language: 'en' },
      { success: true, language: 'en' },
      { success: !!result.summary, language: result.language }
    );

    expect(result.language).toBe('en');
  });

  // 场景 5：支持重点关注领域
  it('should support focus areas', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockDocumentContent);
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockSummaryResponse);

    const result = await summaryService.generateSummary({
      userId: mockUserId,
      documentId: mockDocumentId,
      length: 'medium',
      focusAreas: ['技术细节', '应用场景'],
    });

    logTestInfo(
      { focusAreas: ['技术细节', '应用场景'] },
      { success: true },
      { success: !!result.summary }
    );

    expect(result.summary).toBeDefined();
    // The focus areas are passed to the prompt builder
    expect(mockLLMProvider.generate).toHaveBeenCalled();
  });

  // 场景 6：长文档使用分层摘要
  it('should use hierarchical summarization for long documents', async () => {
    vi.mocked(documentContentService.getContent).mockResolvedValue(mockLongDocumentContent);
    // First call for chunk summaries, then for merge
    vi.mocked(mockLLMProvider.generate)
      .mockResolvedValueOnce('Chunk 1 summary')
      .mockResolvedValueOnce('Chunk 2 summary')
      .mockResolvedValueOnce('Chunk 3 summary')
      .mockResolvedValue(mockSummaryResponse);

    const result = await summaryService.generateSummary({
      userId: mockUserId,
      documentId: mockDocumentId,
      length: 'detailed',
    });

    logTestInfo(
      { contentLength: mockLongDocumentContent.textContent?.length },
      { success: true, multipleCalls: true },
      { success: !!result.summary, callCount: mockLLMProvider.generate.mock.calls.length }
    );

    expect(result.summary).toBeDefined();
    // Should have multiple calls for hierarchical summarization
    expect(mockLLMProvider.generate.mock.calls.length).toBeGreaterThan(1);
  });
});

// ==================== directSummarize ====================
describe('summaryService > directSummarize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock to default behavior
    vi.mocked(mockLLMProvider.generate).mockReset();
  });

  it('should call LLM provider with correct messages', async () => {
    vi.mocked(mockLLMProvider.generate).mockResolvedValue(mockSummaryResponse);

    const result = await summaryService.directSummarize(
      mockLLMProvider,
      mockDocumentContent.textContent!,
      { length: 'medium' },
      { temperature: 0.7 }
    );

    logTestInfo({ length: 'medium' }, { hasSummary: true }, { hasSummary: !!result });

    expect(result).toBe(mockSummaryResponse);
    expect(mockLLMProvider.generate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]),
      expect.any(Object)
    );
  });
});

// ==================== hierarchicalSummarize ====================
describe('summaryService > hierarchicalSummarize', () => {
  const fixedChunkLongContent = ['A'.repeat(13_000), 'B'.repeat(13_000), 'C'.repeat(13_000)].join(
    '\n\n'
  );

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock to default behavior
    vi.mocked(mockLLMProvider.generate).mockReset();
  });

  it('should split content and merge summaries', async () => {
    const longContent = mockLongDocumentContent.textContent!;
    vi.mocked(mockLLMProvider.generate)
      .mockResolvedValueOnce('Part 1 summary')
      .mockResolvedValueOnce('Part 2 summary')
      .mockResolvedValue('Final merged summary');

    const result = await summaryService.hierarchicalSummarize(
      mockLLMProvider,
      longContent,
      { length: 'detailed' },
      { temperature: 0.7 }
    );

    logTestInfo(
      { contentLength: longContent.length },
      { hasResult: true },
      { hasResult: !!result }
    );

    expect(result).toBeDefined();
    expect(mockLLMProvider.generate).toHaveBeenCalled();
  });

  it('should continue merging successful chunk summaries when one chunk fails', async () => {
    vi.mocked(mockLLMProvider.generate)
      .mockRejectedValueOnce(new Error('Chunk 1 failed'))
      .mockResolvedValueOnce('Part 2 summary')
      .mockResolvedValueOnce('Part 3 summary')
      .mockResolvedValue('Final merged summary');

    const result = await summaryService.hierarchicalSummarize(
      mockLLMProvider,
      fixedChunkLongContent,
      { length: 'detailed' },
      { temperature: 0.7 }
    );

    logTestInfo(
      { chunkCount: 3, failedChunks: [1] },
      { success: true, mergeIncludesSuccessfulChunksOnly: true },
      { success: result === 'Final merged summary' }
    );

    const mergeMessages = vi.mocked(mockLLMProvider.generate).mock.calls.at(-1)?.[0];
    const mergeUserMessage = mergeMessages?.find((message: { role: string }) => message.role === 'user');

    expect(result).toBe('Final merged summary');
    expect(mockLLMProvider.generate).toHaveBeenCalledTimes(4);
    expect(mergeUserMessage?.content).toContain('Part 2 summary');
    expect(mergeUserMessage?.content).toContain('Part 3 summary');
    expect(mergeUserMessage?.content).not.toContain('Chunk 1 failed');
  });

  it('should throw when all chunk summaries fail', async () => {
    vi.mocked(mockLLMProvider.generate).mockRejectedValue(new Error('All chunks failed'));

    await expect(
      summaryService.hierarchicalSummarize(
        mockLLMProvider,
        fixedChunkLongContent,
        { length: 'detailed' },
        { temperature: 0.7 }
      )
    ).rejects.toThrow('All chunks failed');

    expect(mockLLMProvider.generate).toHaveBeenCalledTimes(3);
  });
});
