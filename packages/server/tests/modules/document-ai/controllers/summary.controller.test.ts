import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { DOCUMENT_AI_ERROR_CODES } from '@groundpath/shared';
import { AppError } from '@core/errors';
import {
  mockUserId,
  mockDocumentId,
  mockSummaryResponse,
  logTestInfo,
} from '@tests/__mocks__/document-ai.mocks';

vi.mock('@modules/document-ai/services/summary.service', () => ({
  summaryService: {
    generateSummary: vi.fn(),
    streamSummary: vi.fn(),
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

import { summaryController } from '@modules/document-ai/controllers/summary.controller';
import { summaryService } from '@modules/document-ai/services/summary.service';
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

describe('summaryController > generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate summary and return success response', async () => {
    const mockResult = {
      summary: mockSummaryResponse,
      wordCount: 100,
      language: 'zh',
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(summaryService.generateSummary).mockResolvedValue(mockResult);

    const validatedBody = {
      length: 'medium',
      language: undefined,
      focusAreas: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(summaryController.generate, req, res, next);

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
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass all parameters to service', async () => {
    const mockResult = {
      summary: mockSummaryResponse,
      wordCount: 100,
      language: 'en',
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(summaryService.generateSummary).mockResolvedValue(mockResult);

    const validatedBody = {
      length: 'detailed',
      language: 'en',
      focusAreas: ['技术', '应用'],
    };
    const req = createMockRequest(
      { id: mockDocumentId },
      { length: 'detailed', language: 'en', focusAreas: ['技术', '应用'] }
    );
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(summaryController.generate, req, res, next);

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
    expect(next).not.toHaveBeenCalled();
  });

  it('should forward service errors to next', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.CONTENT_EMPTY as 'DOCUMENT_AI_CONTENT_EMPTY',
      'Document has no content',
      400
    );
    vi.mocked(summaryService.generateSummary).mockRejectedValue(error);

    const validatedBody = {
      length: 'medium',
      language: undefined,
      focusAreas: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse(validatedBody);
    let nextError: unknown;
    const next = vi.fn((err?: unknown) => {
      nextError = err;
    }) as unknown as NextFunction;

    await callController(summaryController.generate, req, res, next);

    logTestInfo({ documentId: mockDocumentId }, { nextCalled: true }, { nextError });

    expect(nextError).toBe(error);
    expect(handleError).not.toHaveBeenCalled();
  });

  it('should handle array-style params.id', async () => {
    const mockResult = {
      summary: mockSummaryResponse,
      wordCount: 100,
      language: 'zh',
      generatedAt: new Date().toISOString(),
    };
    vi.mocked(summaryService.generateSummary).mockResolvedValue(mockResult);

    const validatedBody = {
      length: 'medium',
      language: undefined,
      focusAreas: undefined,
    };
    const req = {
      user: { sub: mockUserId },
      params: { id: [mockDocumentId, 'ignored'] },
      body: { length: 'medium' },
    } as unknown as Request;
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(summaryController.generate, req, res, next);

    expect(summaryService.generateSummary).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: mockDocumentId })
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('summaryController > stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call streamSummary service', async () => {
    vi.mocked(summaryService.streamSummary).mockResolvedValue(undefined);

    const validatedBody = {
      length: 'medium',
      language: undefined,
      focusAreas: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(summaryController.stream, req, res, next);

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
    expect(next).not.toHaveBeenCalled();
  });

  it('should register close event listener for abort', async () => {
    vi.mocked(summaryService.streamSummary).mockResolvedValue(undefined);

    const validatedBody = {
      length: 'medium',
      language: undefined,
      focusAreas: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse(validatedBody);
    const next = vi.fn() as unknown as NextFunction;

    await callController(summaryController.stream, req, res, next);

    logTestInfo(
      { documentId: mockDocumentId },
      { closeListenerRegistered: true },
      { closeListenerRegistered: vi.mocked(res.on).mock.calls.some((c) => c[0] === 'close') }
    );

    expect(res.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle error when headers not sent', async () => {
    const error = new AppError(
      DOCUMENT_AI_ERROR_CODES.STREAMING_FAILED as 'DOCUMENT_AI_STREAMING_FAILED',
      'Streaming failed',
      500
    );
    vi.mocked(summaryService.streamSummary).mockRejectedValue(error);

    const validatedBody = {
      length: 'medium',
      language: undefined,
      focusAreas: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse(validatedBody);
    (res as { headersSent: boolean }).headersSent = false;
    const next = vi.fn() as unknown as NextFunction;

    await callController(summaryController.stream, req, res, next);

    logTestInfo(
      { headersSent: false },
      { handleErrorCalled: true },
      { handleErrorCalled: vi.mocked(handleError).mock.calls.length > 0 }
    );

    expect(handleError).toHaveBeenCalledWith(error, res, 'Stream summary');
    expect(next).not.toHaveBeenCalled();
  });

  it('should not call handleError when headers already sent', async () => {
    const error = new Error('Stream interrupted');
    vi.mocked(summaryService.streamSummary).mockRejectedValue(error);

    const validatedBody = {
      length: 'medium',
      language: undefined,
      focusAreas: undefined,
    };
    const req = createMockRequest({ id: mockDocumentId }, { length: 'medium' });
    const res = createMockResponse(validatedBody);
    (res as { headersSent: boolean }).headersSent = true;
    const next = vi.fn() as unknown as NextFunction;

    await callController(summaryController.stream, req, res, next);

    logTestInfo(
      { headersSent: true },
      { handleErrorNotCalled: true },
      { handleErrorNotCalled: vi.mocked(handleError).mock.calls.length === 0 }
    );

    expect(handleError).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
