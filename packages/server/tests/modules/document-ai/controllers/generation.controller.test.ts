import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { DOCUMENT_AI_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@core/errors';
import {
  mockUserId,
  mockDocumentId,
  mockKnowledgeBaseId,
  mockGenerationResponse,
  mockExpandResponse,
  logTestInfo,
} from '@tests/__mocks__/document-ai.mocks';

// ==================== Mocks ====================

vi.mock('@modules/document-ai/services/generation.service', () => ({
  generationService: {
    generate: vi.fn(),
    streamGenerate: vi.fn(),
    expand: vi.fn(),
    streamExpand: vi.fn(),
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
import { generationController } from '@modules/document-ai/controllers/generation.controller';
import { generationService } from '@modules/document-ai/services/generation.service';
import { sendSuccessResponse, handleError } from '@core/errors';

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
describe('generationController > generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功生成内容
  it('should generate content and return success response', async () => {
    const mockResult = {
      content: mockGenerationResponse,
      wordCount: 150,
      style: 'formal' as const,
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(generationService.generate).mockResolvedValue(mockResult);

    const req = createMockRequest(
      {},
      {
        prompt: '写一篇关于人工智能的文章',
        style: 'formal',
      }
    );
    const res = createMockResponse();

    await generationController.generate(req, res);

    logTestInfo(
      { prompt: '写一篇关于人工智能的文章', style: 'formal' },
      { success: true },
      { calledSendSuccess: vi.mocked(sendSuccessResponse).mock.calls.length > 0 }
    );

    expect(generationService.generate).toHaveBeenCalledWith({
      userId: mockUserId,
      prompt: '写一篇关于人工智能的文章',
      template: undefined,
      style: 'formal',
      language: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
      contextDocumentIds: undefined,
    });
    expect(sendSuccessResponse).toHaveBeenCalledWith(res, mockResult);
  });

  // 场景 2：传递所有参数（包括 RAG）
  it('should pass all parameters including RAG options', async () => {
    const mockResult = {
      content: mockGenerationResponse,
      wordCount: 150,
      template: 'report' as const,
      style: 'technical' as const,
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(generationService.generate).mockResolvedValue(mockResult);

    const req = createMockRequest(
      {},
      {
        prompt: '生成技术报告',
        template: 'report',
        style: 'technical',
        language: 'zh',
        maxLength: 5000,
        knowledgeBaseId: mockKnowledgeBaseId,
        contextDocumentIds: [mockDocumentId],
      }
    );
    const res = createMockResponse();

    await generationController.generate(req, res);

    logTestInfo(
      { template: 'report', knowledgeBaseId: mockKnowledgeBaseId },
      { allParamsPassed: true },
      { calledWith: vi.mocked(generationService.generate).mock.calls[0] }
    );

    expect(generationService.generate).toHaveBeenCalledWith({
      userId: mockUserId,
      prompt: '生成技术报告',
      template: 'report',
      style: 'technical',
      language: 'zh',
      maxLength: 5000,
      knowledgeBaseId: mockKnowledgeBaseId,
      contextDocumentIds: [mockDocumentId],
    });
  });

  // 场景 3：服务抛出错误
  it('should handle service errors', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.GENERATION_FAILED as 'DOCUMENT_AI_GENERATION_FAILED',
      'Generation failed',
      500
    );
    vi.mocked(generationService.generate).mockRejectedValue(error);

    const req = createMockRequest({}, { prompt: 'Test prompt' });
    const res = createMockResponse();

    await generationController.generate(req, res);

    expect(handleError).toHaveBeenCalledWith(error, res, 'Generate content');
  });
});

// ==================== streamGenerate ====================
describe('generationController > streamGenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功启动流式生成
  it('should call streamGenerate service', async () => {
    vi.mocked(generationService.streamGenerate).mockResolvedValue(undefined);

    const req = createMockRequest({}, { prompt: 'Generate content', style: 'formal' });
    const res = createMockResponse();

    await generationController.streamGenerate(req, res);

    logTestInfo(
      { prompt: 'Generate content' },
      { streamGenerateCalled: true },
      { streamGenerateCalled: vi.mocked(generationService.streamGenerate).mock.calls.length > 0 }
    );

    expect(generationService.streamGenerate).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        userId: mockUserId,
        prompt: 'Generate content',
        style: 'formal',
        signal: expect.any(AbortSignal),
      })
    );
  });

  // 场景 2：注册 close 事件监听器
  it('should register close event listener for abort', async () => {
    vi.mocked(generationService.streamGenerate).mockResolvedValue(undefined);

    const req = createMockRequest({}, { prompt: 'Test' });
    const res = createMockResponse();

    await generationController.streamGenerate(req, res);

    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  // 场景 3：流式服务抛出错误且 headers 未发送
  it('should handle error when headers not sent', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.STREAMING_FAILED as 'DOCUMENT_AI_STREAMING_FAILED',
      'Streaming failed',
      500
    );
    vi.mocked(generationService.streamGenerate).mockRejectedValue(error);

    const req = createMockRequest({}, { prompt: 'Test' });
    const res = createMockResponse();
    (res as { headersSent: boolean }).headersSent = false;

    await generationController.streamGenerate(req, res);

    expect(handleError).toHaveBeenCalledWith(error, res, 'Stream generate content');
  });

  // 场景 4：流式服务抛出错误但 headers 已发送
  it('should not call handleError when headers already sent', async () => {
    const error = new Error('Stream interrupted');
    vi.mocked(generationService.streamGenerate).mockRejectedValue(error);

    const req = createMockRequest({}, { prompt: 'Test' });
    const res = createMockResponse();
    (res as { headersSent: boolean }).headersSent = true;

    await generationController.streamGenerate(req, res);

    expect(handleError).not.toHaveBeenCalled();
  });
});

// ==================== expand ====================
describe('generationController > expand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功扩展文档
  it('should expand document and return success response', async () => {
    const mockResult = {
      content: mockExpandResponse,
      wordCount: 80,
      position: 'after' as const,
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(generationService.expand).mockResolvedValue(mockResult);

    const req = createMockRequest(
      { id: mockDocumentId },
      { instruction: '添加更多细节', position: 'after' }
    );
    const res = createMockResponse();

    await generationController.expand(req, res);

    logTestInfo(
      { documentId: mockDocumentId, instruction: '添加更多细节', position: 'after' },
      { success: true },
      { calledSendSuccess: vi.mocked(sendSuccessResponse).mock.calls.length > 0 }
    );

    expect(generationService.expand).toHaveBeenCalledWith({
      userId: mockUserId,
      documentId: mockDocumentId,
      instruction: '添加更多细节',
      position: 'after',
      style: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
    });
    expect(sendSuccessResponse).toHaveBeenCalledWith(res, mockResult);
  });

  // 场景 2：传递所有参数
  it('should pass all parameters to service', async () => {
    const mockResult = {
      content: mockExpandResponse,
      wordCount: 80,
      position: 'before' as const,
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(generationService.expand).mockResolvedValue(mockResult);

    const req = createMockRequest(
      { id: mockDocumentId },
      {
        instruction: '扩展内容',
        position: 'before',
        style: 'academic',
        maxLength: 2000,
        knowledgeBaseId: mockKnowledgeBaseId,
      }
    );
    const res = createMockResponse();

    await generationController.expand(req, res);

    expect(generationService.expand).toHaveBeenCalledWith({
      userId: mockUserId,
      documentId: mockDocumentId,
      instruction: '扩展内容',
      position: 'before',
      style: 'academic',
      maxLength: 2000,
      knowledgeBaseId: mockKnowledgeBaseId,
    });
  });

  // 场景 3：服务抛出错误
  it('should handle service errors', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
      'No content to expand',
      400
    );
    vi.mocked(generationService.expand).mockRejectedValue(error);

    const req = createMockRequest(
      { id: mockDocumentId },
      { instruction: 'Test', position: 'after' }
    );
    const res = createMockResponse();

    await generationController.expand(req, res);

    expect(handleError).toHaveBeenCalledWith(error, res, 'Expand document');
  });
});

// ==================== streamExpand ====================
describe('generationController > streamExpand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功启动流式扩展
  it('should call streamExpand service', async () => {
    vi.mocked(generationService.streamExpand).mockResolvedValue(undefined);

    const req = createMockRequest(
      { id: mockDocumentId },
      { instruction: '扩展内容', position: 'after' }
    );
    const res = createMockResponse();

    await generationController.streamExpand(req, res);

    logTestInfo(
      { documentId: mockDocumentId, instruction: '扩展内容' },
      { streamExpandCalled: true },
      { streamExpandCalled: vi.mocked(generationService.streamExpand).mock.calls.length > 0 }
    );

    expect(generationService.streamExpand).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        userId: mockUserId,
        documentId: mockDocumentId,
        instruction: '扩展内容',
        position: 'after',
        signal: expect.any(AbortSignal),
      })
    );
  });

  // 场景 2：注册 close 事件监听器
  it('should register close event listener for abort', async () => {
    vi.mocked(generationService.streamExpand).mockResolvedValue(undefined);

    const req = createMockRequest(
      { id: mockDocumentId },
      { instruction: 'Test', position: 'after' }
    );
    const res = createMockResponse();

    await generationController.streamExpand(req, res);

    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  // 场景 3：流式服务抛出错误且 headers 未发送
  it('should handle error when headers not sent', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.STREAMING_FAILED as 'DOCUMENT_AI_STREAMING_FAILED',
      'Streaming failed',
      500
    );
    vi.mocked(generationService.streamExpand).mockRejectedValue(error);

    const req = createMockRequest(
      { id: mockDocumentId },
      { instruction: 'Test', position: 'after' }
    );
    const res = createMockResponse();
    (res as { headersSent: boolean }).headersSent = false;

    await generationController.streamExpand(req, res);

    expect(handleError).toHaveBeenCalledWith(error, res, 'Stream expand document');
  });

  // 场景 4：流式服务抛出错误但 headers 已发送
  it('should not call handleError when headers already sent', async () => {
    const error = new Error('Stream interrupted');
    vi.mocked(generationService.streamExpand).mockRejectedValue(error);

    const req = createMockRequest(
      { id: mockDocumentId },
      { instruction: 'Test', position: 'after' }
    );
    const res = createMockResponse();
    (res as { headersSent: boolean }).headersSent = true;

    await generationController.streamExpand(req, res);

    expect(handleError).not.toHaveBeenCalled();
  });

  // 场景 5：传递所有参数（包括 style 和 knowledgeBaseId）
  it('should pass all parameters to service', async () => {
    vi.mocked(generationService.streamExpand).mockResolvedValue(undefined);

    const req = createMockRequest(
      { id: mockDocumentId },
      {
        instruction: '扩展内容',
        position: 'replace',
        style: 'creative',
        maxLength: 3000,
        knowledgeBaseId: mockKnowledgeBaseId,
      }
    );
    const res = createMockResponse();

    await generationController.streamExpand(req, res);

    expect(generationService.streamExpand).toHaveBeenCalledWith(
      res,
      expect.objectContaining({
        userId: mockUserId,
        documentId: mockDocumentId,
        instruction: '扩展内容',
        position: 'replace',
        style: 'creative',
        maxLength: 3000,
        knowledgeBaseId: mockKnowledgeBaseId,
      })
    );
  });
});
