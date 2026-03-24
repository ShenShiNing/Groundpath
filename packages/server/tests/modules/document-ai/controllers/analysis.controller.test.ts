import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { DOCUMENT_AI_ERROR_CODES } from '@groundpath/shared';
import { AppError } from '@core/errors';
import { mockUserId, mockDocumentId, logTestInfo } from '@tests/__mocks__/document-ai.mocks';

// ==================== Mocks ====================

vi.mock('@modules/document-ai/services/analysis.service', () => ({
  analysisService: {
    analyze: vi.fn(),
    extractKeywords: vi.fn(),
    extractEntities: vi.fn(),
    getStructure: vi.fn(),
  },
}));

vi.mock('@core/errors', async (importOriginal) => {
  const original = await importOriginal<typeof import('@core/errors')>();
  return {
    ...original,
    sendSuccessResponse: vi.fn((res, data) => {
      res.status(200).json({ success: true, data });
    }),
    handleError: vi.fn((error, res) => {
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      res.status(statusCode).json({ success: false, error: { code, message: error.message } });
    }),
  };
});

// Import after mocks
import { analysisController } from '@modules/document-ai/controllers/analysis.controller';
import { analysisService } from '@modules/document-ai/services/analysis.service';
import { sendSuccessResponse, handleError } from '@core/errors';

// ==================== Test Helpers ====================

function createMockRequest(params: Record<string, string> = {}, body: object = {}): Request {
  return {
    user: { sub: mockUserId },
    params,
    body,
  } as unknown as Request;
}

function createMockResponse(validatedBody: object = {}) {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: {
      validated: {
        body: validatedBody,
      },
    },
  } as unknown as Response;
}

// ==================== analyze ====================
describe('analysisController > analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功执行完整分析
  it('should perform analysis and return success response', async () => {
    const mockResult = {
      documentId: mockDocumentId,
      keywords: [{ word: 'AI', relevance: 0.95 }],
      structure: {
        characterCount: 100,
        wordCount: 50,
        paragraphCount: 3,
        sentenceCount: 10,
        estimatedReadingTimeMinutes: 1,
        headings: [],
      },
      analyzedAt: new Date().toISOString(),
    };
    vi.mocked(analysisService.analyze).mockResolvedValue(mockResult);

    const req = createMockRequest(
      { id: mockDocumentId },
      { analysisTypes: ['keywords', 'structure'], maxKeywords: 10 }
    );
    const res = createMockResponse({
      analysisTypes: ['keywords', 'structure'],
      maxKeywords: 10,
      maxEntities: 20,
      maxTopics: 5,
    });

    await analysisController.analyze(req, res);

    logTestInfo(
      { documentId: mockDocumentId, analysisTypes: ['keywords', 'structure'] },
      { success: true },
      { calledSendSuccess: vi.mocked(sendSuccessResponse).mock.calls.length > 0 }
    );

    expect(analysisService.analyze).toHaveBeenCalledWith({
      userId: mockUserId,
      documentId: mockDocumentId,
      analysisTypes: ['keywords', 'structure'],
      maxKeywords: 10,
      maxEntities: 20,
      maxTopics: 5,
    });
    expect(sendSuccessResponse).toHaveBeenCalledWith(res, mockResult);
  });

  // 场景 2：使用默认分析类型
  it('should use default analysis types when not specified', async () => {
    const mockResult = {
      documentId: mockDocumentId,
      keywords: [],
      structure: {
        characterCount: 100,
        wordCount: 50,
        paragraphCount: 3,
        sentenceCount: 10,
        estimatedReadingTimeMinutes: 1,
        headings: [],
      },
      analyzedAt: new Date().toISOString(),
    };
    vi.mocked(analysisService.analyze).mockResolvedValue(mockResult);

    const req = createMockRequest({ id: mockDocumentId }, {});
    const res = createMockResponse({
      analysisTypes: ['keywords', 'structure'],
      maxKeywords: 10,
      maxEntities: 20,
      maxTopics: 5,
    });

    await analysisController.analyze(req, res);

    logTestInfo(
      { noAnalysisTypes: true },
      { defaultsUsed: true },
      { calledWith: vi.mocked(analysisService.analyze).mock.calls[0] }
    );

    expect(analysisService.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisTypes: ['keywords', 'structure'],
      })
    );
  });

  // 场景 3：服务抛出错误
  it('should handle service errors', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
      'Document has no content',
      400
    );
    vi.mocked(analysisService.analyze).mockRejectedValue(error);

    const req = createMockRequest({ id: mockDocumentId }, { analysisTypes: ['keywords'] });
    const res = createMockResponse({
      analysisTypes: ['keywords'],
      maxKeywords: 10,
      maxEntities: 20,
      maxTopics: 5,
    });

    await analysisController.analyze(req, res);

    logTestInfo(
      { error: DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY },
      { handleErrorCalled: true },
      { handleErrorCalled: vi.mocked(handleError).mock.calls.length > 0 }
    );

    expect(handleError).toHaveBeenCalledWith(error, res, 'Analyze document');
  });
});

// ==================== extractKeywords ====================
describe('analysisController > extractKeywords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功提取关键词
  it('should extract keywords and return success response', async () => {
    const mockResult = {
      keywords: [
        { word: 'AI', relevance: 0.95 },
        { word: '机器学习', relevance: 0.88 },
      ],
    };
    vi.mocked(analysisService.extractKeywords).mockResolvedValue(mockResult);

    const req = createMockRequest({ id: mockDocumentId }, { maxKeywords: 5 });
    const res = createMockResponse({ maxKeywords: 5 });

    await analysisController.extractKeywords(req, res);

    logTestInfo(
      { documentId: mockDocumentId, maxKeywords: 5 },
      { success: true, keywordCount: 2 },
      { calledSendSuccess: vi.mocked(sendSuccessResponse).mock.calls.length > 0 }
    );

    expect(analysisService.extractKeywords).toHaveBeenCalledWith(mockUserId, mockDocumentId, {
      maxKeywords: 5,
      language: undefined,
    });
    expect(sendSuccessResponse).toHaveBeenCalledWith(res, mockResult);
  });

  // 场景 2：传递语言参数
  it('should pass language option to service', async () => {
    const mockResult = { keywords: [] };
    vi.mocked(analysisService.extractKeywords).mockResolvedValue(mockResult);

    const req = createMockRequest({ id: mockDocumentId }, { maxKeywords: 10, language: 'en' });
    const res = createMockResponse({ maxKeywords: 10, language: 'en' });

    await analysisController.extractKeywords(req, res);

    expect(analysisService.extractKeywords).toHaveBeenCalledWith(mockUserId, mockDocumentId, {
      maxKeywords: 10,
      language: 'en',
    });
  });

  // 场景 3：服务抛出错误
  it('should handle service errors', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.ANALYSIS_FAILED as 'DOCUMENT_AI_ANALYSIS_FAILED',
      'Analysis failed',
      500
    );
    vi.mocked(analysisService.extractKeywords).mockRejectedValue(error);

    const req = createMockRequest({ id: mockDocumentId }, {});
    const res = createMockResponse({ maxKeywords: 10 });

    await analysisController.extractKeywords(req, res);

    expect(handleError).toHaveBeenCalledWith(error, res, 'Extract keywords');
  });
});

// ==================== extractEntities ====================
describe('analysisController > extractEntities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功提取实体
  it('should extract entities and return success response', async () => {
    const mockResult = {
      entities: [{ text: 'OpenAI', type: 'organization' as const, confidence: 0.95 }],
    };
    vi.mocked(analysisService.extractEntities).mockResolvedValue(mockResult);

    const req = createMockRequest({ id: mockDocumentId }, { maxEntities: 10 });
    const res = createMockResponse({ maxEntities: 10 });

    await analysisController.extractEntities(req, res);

    logTestInfo(
      { documentId: mockDocumentId, maxEntities: 10 },
      { success: true },
      { calledSendSuccess: vi.mocked(sendSuccessResponse).mock.calls.length > 0 }
    );

    expect(analysisService.extractEntities).toHaveBeenCalledWith(mockUserId, mockDocumentId, {
      maxEntities: 10,
      language: undefined,
    });
    expect(sendSuccessResponse).toHaveBeenCalledWith(res, mockResult);
  });

  // 场景 2：服务抛出错误
  it('should handle service errors', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
      'No content',
      400
    );
    vi.mocked(analysisService.extractEntities).mockRejectedValue(error);

    const req = createMockRequest({ id: mockDocumentId }, {});
    const res = createMockResponse({ maxEntities: 20 });

    await analysisController.extractEntities(req, res);

    expect(handleError).toHaveBeenCalledWith(error, res, 'Extract entities');
  });
});

// ==================== getStructure ====================
describe('analysisController > getStructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功获取结构
  it('should get structure and return success response', async () => {
    const mockResult = {
      structure: {
        characterCount: 1000,
        wordCount: 200,
        paragraphCount: 5,
        sentenceCount: 20,
        estimatedReadingTimeMinutes: 1,
        headings: [{ level: 1, text: 'Title', position: 0 }],
      },
    };
    vi.mocked(analysisService.getStructure).mockResolvedValue(mockResult);

    const req = createMockRequest({ id: mockDocumentId }, {});
    const res = createMockResponse();

    await analysisController.getStructure(req, res);

    logTestInfo(
      { documentId: mockDocumentId },
      { success: true, hasStructure: true },
      { calledSendSuccess: vi.mocked(sendSuccessResponse).mock.calls.length > 0 }
    );

    expect(analysisService.getStructure).toHaveBeenCalledWith(mockUserId, mockDocumentId);
    expect(sendSuccessResponse).toHaveBeenCalledWith(res, mockResult);
  });

  // 场景 2：服务抛出错误
  it('should handle service errors', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
      'No content',
      400
    );
    vi.mocked(analysisService.getStructure).mockRejectedValue(error);

    const req = createMockRequest({ id: mockDocumentId }, {});
    const res = createMockResponse();

    await analysisController.getStructure(req, res);

    expect(handleError).toHaveBeenCalledWith(error, res, 'Get document structure');
  });

  // 场景 3：GET 请求不需要 body
  it('should work without request body (GET request)', async () => {
    const mockResult = {
      structure: {
        characterCount: 500,
        wordCount: 100,
        paragraphCount: 3,
        sentenceCount: 10,
        estimatedReadingTimeMinutes: 1,
        headings: [],
      },
    };
    vi.mocked(analysisService.getStructure).mockResolvedValue(mockResult);

    const req = {
      user: { sub: mockUserId },
      params: { id: mockDocumentId },
      // No body for GET request
    } as unknown as Request;
    const res = createMockResponse();

    await analysisController.getStructure(req, res);

    expect(analysisService.getStructure).toHaveBeenCalledWith(mockUserId, mockDocumentId);
    expect(sendSuccessResponse).toHaveBeenCalled();
  });
});
