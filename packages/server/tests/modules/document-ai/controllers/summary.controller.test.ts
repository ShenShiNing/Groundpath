import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { DOCUMENT_AI_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@shared/errors';
import {
  mockUserId,
  mockDocumentId,
  mockSummaryResponse,
  logTestInfo,
} from '@tests/__mocks__/document-ai.mocks';

// ==================== Mocks ====================

vi.mock('@modules/document-ai/services/summary.service', () => ({
  summaryService: {
    generateSummary: vi.fn(),
    streamSummary: vi.fn(),
  },
}));

vi.mock('@shared/errors', async (importOriginal) => {
  const original = await importOriginal<typeof import('@shared/errors')>();
  return {
    ...original,
    sendSuccessResponse: vi.fn((res, data) => {
      res.status(200).json({ success: true, data });
    }),
    handleError: vi.fn((error, res, _context) => {
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      res.status(statusCode).json({ success: false, error: { code, message: error.message } });
    }),
  };
});

// Import after mocks
import { summaryController } from '@modules/document-ai/controllers/summary.controller';
import { summaryService } from '@modules/document-ai/services/summary.service';
import { sendSuccessResponse, handleError } from '@shared/errors';

// ==================== Test Helpers ====================

function createMockRequest(params: Record<string, string> = {}, body: object = {}): Request {
  return {
    user: { sub: mockUserId },
    params,
    body,
  } as unknown as Request;
}

function createMockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    headersSent: false,
  } as unknown as Response;
  return res;
}

// ==================== generate ====================
describe('summaryController > generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功生成摘要
  it('should generate summary and return success response', async () => {
    const mockResult = {
      summary: mockSummaryResponse,
      wordCount: 100,
      language: 'zh',
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(summaryService.generateSummary).mockResolvedValue(mockResult);

    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse();

    await summaryController.generate(req, res);

    logTestInfo(
      { documentId: mockDocumentId, length: 'medium' },
      { success: true, hasData: true },
      { success: true, calledSendSuccess: vi.mocked(sendSuccessResponse).mock.calls.length > 0 }
    );

    expect(summaryService.generateSummary).toHaveBeenCalledWith({
      userId: mockUserId,
      documentId: mockDocumentId,
      length: 'medium',
      language: undefined,
      focusAreas: undefined,
    });
    expect(sendSuccessResponse).toHaveBeenCalledWith(res, mockResult);
  });

  // 场景 2：传递所有参数
  it('should pass all parameters to service', async () => {
    const mockResult = {
      summary: mockSummaryResponse,
      wordCount: 100,
      language: 'en',
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(summaryService.generateSummary).mockResolvedValue(mockResult);

    const req = createMockRequest(
      { id: mockDocumentId },
      { length: 'detailed', language: 'en', focusAreas: ['技术', '应用'] }
    );
    const res = createMockResponse();

    await summaryController.generate(req, res);

    logTestInfo(
      { length: 'detailed', language: 'en', focusAreas: ['技术', '应用'] },
      { allParamsPassed: true },
      { calledWith: vi.mocked(summaryService.generateSummary).mock.calls[0] }
    );

    expect(summaryService.generateSummary).toHaveBeenCalledWith({
      userId: mockUserId,
      documentId: mockDocumentId,
      length: 'detailed',
      language: 'en',
      focusAreas: ['技术', '应用'],
    });
  });

  // 场景 3：服务抛出错误
  it('should handle service errors', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
      'Document has no content',
      400
    );
    vi.mocked(summaryService.generateSummary).mockRejectedValue(error);

    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse();

    await summaryController.generate(req, res);

    logTestInfo(
      { documentId: mockDocumentId },
      { handleErrorCalled: true },
      { handleErrorCalled: vi.mocked(handleError).mock.calls.length > 0 }
    );

    expect(handleError).toHaveBeenCalledWith(error, res, 'Generate summary');
  });

  // 场景 4：处理数组形式的 params.id
  it('should handle array-style params.id', async () => {
    const mockResult = {
      summary: mockSummaryResponse,
      wordCount: 100,
      language: 'zh',
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(summaryService.generateSummary).mockResolvedValue(mockResult);

    const req = {
      user: { sub: mockUserId },
      params: { id: [mockDocumentId, 'ignored'] },
      body: { length: 'medium' },
    } as unknown as Request;
    const res = createMockResponse();

    await summaryController.generate(req, res);

    expect(summaryService.generateSummary).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: mockDocumentId })
    );
  });
});

// ==================== stream ====================
describe('summaryController > stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功启动流式摘要
  it('should call streamSummary service', async () => {
    vi.mocked(summaryService.streamSummary).mockResolvedValue(undefined);

    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse();

    await summaryController.stream(req, res);

    logTestInfo(
      { documentId: mockDocumentId },
      { streamSummaryCalled: true },
      { streamSummaryCalled: vi.mocked(summaryService.streamSummary).mock.calls.length > 0 }
    );

    expect(summaryService.streamSummary).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        userId: mockUserId,
        documentId: mockDocumentId,
        length: 'medium',
        signal: expect.any(AbortSignal),
      })
    );
  });

  // 场景 2：注册 close 事件监听器
  it('should register close event listener for abort', async () => {
    vi.mocked(summaryService.streamSummary).mockResolvedValue(undefined);

    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse();

    await summaryController.stream(req, res);

    logTestInfo(
      { documentId: mockDocumentId },
      { closeListenerRegistered: true },
      { closeListenerRegistered: vi.mocked(res.on).mock.calls.some((c) => c[0] === 'close') }
    );

    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  // 场景 3：流式服务抛出错误且 headers 未发送
  it('should handle error when headers not sent', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.STREAMING_FAILED as 'DOCUMENT_AI_STREAMING_FAILED',
      'Streaming failed',
      500
    );
    vi.mocked(summaryService.streamSummary).mockRejectedValue(error);

    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse();
    (res as { headersSent: boolean }).headersSent = false;

    await summaryController.stream(req, res);

    logTestInfo(
      { headersSent: false },
      { handleErrorCalled: true },
      { handleErrorCalled: vi.mocked(handleError).mock.calls.length > 0 }
    );

    expect(handleError).toHaveBeenCalledWith(error, res, 'Stream summary');
  });

  // 场景 4：流式服务抛出错误但 headers 已发送
  it('should not call handleError when headers already sent', async () => {
    const error = new Error('Stream interrupted');
    vi.mocked(summaryService.streamSummary).mockRejectedValue(error);

    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse();
    (res as { headersSent: boolean }).headersSent = true;

    await summaryController.stream(req, res);

    logTestInfo(
      { headersSent: true },
      { handleErrorNotCalled: true },
      { handleErrorNotCalled: vi.mocked(handleError).mock.calls.length === 0 }
    );

    expect(handleError).not.toHaveBeenCalled();
  });
});
