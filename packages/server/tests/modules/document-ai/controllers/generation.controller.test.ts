import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { DOCUMENT_AI_ERROR_CODES } from '@groundpath/shared';
import { AppError } from '@core/errors';
import {
  mockUserId,
  mockDocumentId,
  mockKnowledgeBaseId,
  mockGenerationResponse,
  mockExpandResponse,
  logTestInfo,
} from '@tests/__mocks__/document-ai.mocks';

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

import { generationController } from '@modules/document-ai/controllers/generation.controller';
import { generationService } from '@modules/document-ai/services/generation.service';
import { sendSuccessResponse, handleError } from '@core/errors';

function createMockRequest(
  params: Record<string, string | string[]> = {},
  body: object = {}
): Request {
  return {
    user: { sub: mockUserId },
    params,
    body,
  } as unknown as Request;
}

function createMockResponse(validatedBody?: object) {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    headersSent: false,
    locals: {
      validated: {
        body: validatedBody,
      },
    },
  } as unknown as Response;
}

async function callController(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  handler(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));
}

describe('generationController > generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate content and return success response', async () => {
    const mockResult = {
      content: mockGenerationResponse,
      wordCount: 150,
      style: 'formal' as const,
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(generationService.generate).mockResolvedValue(mockResult);

    const validatedBody = {
      prompt: '写一篇关于人工智能的文章',
      template: undefined,
      style: 'formal',
      language: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
      contextDocumentIds: undefined,
    };
    const req = createMockRequest({}, { prompt: 'raw prompt' });
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.generate, req, res, next);

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
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass all parameters including RAG options', async () => {
    const mockResult = {
      content: mockGenerationResponse,
      wordCount: 150,
      template: 'report' as const,
      style: 'technical' as const,
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(generationService.generate).mockResolvedValue(mockResult);

    const validatedBody = {
      prompt: '生成技术报告',
      template: 'report',
      style: 'technical',
      language: 'zh',
      maxLength: 5000,
      knowledgeBaseId: mockKnowledgeBaseId,
      contextDocumentIds: [mockDocumentId],
    };
    const req = createMockRequest({}, validatedBody);
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.generate, req, res, next);

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
    expect(next).not.toHaveBeenCalled();
  });

  it('should forward service errors to next', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.GENERATION_FAILED as 'DOCUMENT_AI_GENERATION_FAILED',
      'Generation failed',
      500
    );
    vi.mocked(generationService.generate).mockRejectedValue(error);

    const validatedBody = {
      prompt: 'Test prompt',
      template: undefined,
      style: undefined,
      language: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
      contextDocumentIds: undefined,
    };
    const req = createMockRequest({}, { prompt: 'Test prompt' });
    const res = createMockResponse(validatedBody);
    let nextError: unknown;
    const next = vi.fn((err?: unknown) => {
      nextError = err;
    }) as unknown as NextFunction;

    await callController(generationController.generate, req, res, next);

    expect(nextError).toBe(error);
    expect(handleError).not.toHaveBeenCalled();
  });
});

describe('generationController > streamGenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call streamGenerate service', async () => {
    vi.mocked(generationService.streamGenerate).mockResolvedValue(undefined);

    const validatedBody = {
      prompt: 'Generate content',
      template: undefined,
      style: 'formal',
      language: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
      contextDocumentIds: undefined,
    };
    const req = createMockRequest({}, { prompt: 'Generate content', style: 'formal' });
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.streamGenerate, req, res, next);

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
    expect(next).not.toHaveBeenCalled();
  });

  it('should register close event listener for abort', async () => {
    vi.mocked(generationService.streamGenerate).mockResolvedValue(undefined);

    const validatedBody = {
      prompt: 'Test',
      template: undefined,
      style: undefined,
      language: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
      contextDocumentIds: undefined,
    };
    const req = createMockRequest({}, { prompt: 'Test' });
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.streamGenerate, req, res, next);

    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle error when headers not sent', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.STREAMING_FAILED as 'DOCUMENT_AI_STREAMING_FAILED',
      'Streaming failed',
      500
    );
    vi.mocked(generationService.streamGenerate).mockRejectedValue(error);

    const validatedBody = {
      prompt: 'Test',
      template: undefined,
      style: undefined,
      language: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
      contextDocumentIds: undefined,
    };
    const req = createMockRequest({}, { prompt: 'Test' });
    const res = createMockResponse(validatedBody);
    (res as { headersSent: boolean }).headersSent = false;
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.streamGenerate, req, res, next);

    expect(handleError).toHaveBeenCalledWith(error, res, 'Stream generate content');
    expect(next).not.toHaveBeenCalled();
  });

  it('should not call handleError when headers already sent', async () => {
    const error = new Error('Stream interrupted');
    vi.mocked(generationService.streamGenerate).mockRejectedValue(error);

    const validatedBody = {
      prompt: 'Test',
      template: undefined,
      style: undefined,
      language: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
      contextDocumentIds: undefined,
    };
    const req = createMockRequest({}, { prompt: 'Test' });
    const res = createMockResponse(validatedBody);
    (res as { headersSent: boolean }).headersSent = true;
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.streamGenerate, req, res, next);

    expect(handleError).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('generationController > expand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should expand document and return success response', async () => {
    const mockResult = {
      content: mockExpandResponse,
      wordCount: 80,
      position: 'after' as const,
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(generationService.expand).mockResolvedValue(mockResult);

    const validatedBody = {
      instruction: '添加更多细节',
      position: 'after',
      style: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, validatedBody);
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.expand, req, res, next);

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
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass all parameters to service', async () => {
    const mockResult = {
      content: mockExpandResponse,
      wordCount: 80,
      position: 'before' as const,
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(generationService.expand).mockResolvedValue(mockResult);

    const validatedBody = {
      instruction: '扩展内容',
      position: 'before',
      style: 'academic',
      maxLength: 2000,
      knowledgeBaseId: mockKnowledgeBaseId,
    };
    const req = createMockRequest({ id: mockDocumentId }, validatedBody);
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.expand, req, res, next);

    expect(generationService.expand).toHaveBeenCalledWith({
      userId: mockUserId,
      documentId: mockDocumentId,
      instruction: '扩展内容',
      position: 'before',
      style: 'academic',
      maxLength: 2000,
      knowledgeBaseId: mockKnowledgeBaseId,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should forward service errors to next', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
      'No content to expand',
      400
    );
    vi.mocked(generationService.expand).mockRejectedValue(error);

    const validatedBody = {
      instruction: 'Test',
      position: 'after',
      style: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, validatedBody);
    const res = createMockResponse(validatedBody);
    let nextError: unknown;
    const next = vi.fn((err?: unknown) => {
      nextError = err;
    }) as unknown as NextFunction;

    await callController(generationController.expand, req, res, next);

    expect(nextError).toBe(error);
    expect(handleError).not.toHaveBeenCalled();
  });
});

describe('generationController > streamExpand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call streamExpand service', async () => {
    vi.mocked(generationService.streamExpand).mockResolvedValue(undefined);

    const validatedBody = {
      instruction: '扩展内容',
      position: 'after',
      style: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, validatedBody);
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.streamExpand, req, res, next);

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
    expect(next).not.toHaveBeenCalled();
  });

  it('should register close event listener for abort', async () => {
    vi.mocked(generationService.streamExpand).mockResolvedValue(undefined);

    const validatedBody = {
      instruction: 'Test',
      position: 'after',
      style: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, validatedBody);
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.streamExpand, req, res, next);

    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle error when headers not sent', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.STREAMING_FAILED as 'DOCUMENT_AI_STREAMING_FAILED',
      'Streaming failed',
      500
    );
    vi.mocked(generationService.streamExpand).mockRejectedValue(error);

    const validatedBody = {
      instruction: 'Test',
      position: 'after',
      style: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, validatedBody);
    const res = createMockResponse(validatedBody);
    (res as { headersSent: boolean }).headersSent = false;
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.streamExpand, req, res, next);

    expect(handleError).toHaveBeenCalledWith(error, res, 'Stream expand document');
    expect(next).not.toHaveBeenCalled();
  });

  it('should not call handleError when headers already sent', async () => {
    const error = new Error('Stream interrupted');
    vi.mocked(generationService.streamExpand).mockRejectedValue(error);

    const validatedBody = {
      instruction: 'Test',
      position: 'after',
      style: undefined,
      maxLength: undefined,
      knowledgeBaseId: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, validatedBody);
    const res = createMockResponse(validatedBody);
    (res as { headersSent: boolean }).headersSent = true;
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.streamExpand, req, res, next);

    expect(handleError).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass all parameters to service', async () => {
    vi.mocked(generationService.streamExpand).mockResolvedValue(undefined);

    const validatedBody = {
      instruction: '扩展内容',
      position: 'replace',
      style: 'creative',
      maxLength: 3000,
      knowledgeBaseId: mockKnowledgeBaseId,
    };
    const req = createMockRequest({ id: mockDocumentId }, validatedBody);
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(generationController.streamExpand, req, res, next);

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
    expect(next).not.toHaveBeenCalled();
  });
});
