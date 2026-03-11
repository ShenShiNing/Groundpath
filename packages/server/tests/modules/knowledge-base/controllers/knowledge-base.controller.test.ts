import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, RequestHandler } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';

const sendSuccessResponseMock = vi.hoisted(() => vi.fn());

vi.mock('@modules/knowledge-base/services/knowledge-base.service', () => ({
  knowledgeBaseService: {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@shared/errors', async (importOriginal) => {
  const original = await importOriginal<typeof import('@shared/errors')>();
  return {
    ...original,
    sendSuccessResponse: sendSuccessResponseMock,
  };
});

import { knowledgeBaseController } from '@modules/knowledge-base/controllers/knowledge-base.controller';
import { knowledgeBaseService } from '@modules/knowledge-base/services/knowledge-base.service';

const mockUserId = 'user-123';
const mockKbId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function createMockRequest(params: Record<string, string> = {}, body: object = {}): Request {
  return {
    user: { sub: mockUserId },
    params,
    body,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest' },
    socket: { remoteAddress: null },
  } as unknown as Request;
}

function createMockResponse(body: object = {}): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: { validated: { body } },
  } as unknown as Response;
}

async function invokeHandler(handler: RequestHandler, req: Request, res: Response) {
  const next = vi.fn();
  handler(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));
  return next;
}

describe('knowledgeBaseController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create knowledge base and return 201 response', async () => {
    const mockResult = { id: mockKbId, name: 'KB 1' };
    vi.mocked(knowledgeBaseService.create).mockResolvedValue(
      mockResult as Awaited<ReturnType<typeof knowledgeBaseService.create>>
    );

    const req = createMockRequest({}, { name: 'KB 1', embeddingProvider: 'openai' });
    const res = createMockResponse({ name: 'KB 1', embeddingProvider: 'openai' });
    const next = await invokeHandler(knowledgeBaseController.create, req, res);

    expect(next).not.toHaveBeenCalled();
    expect(knowledgeBaseService.create).toHaveBeenCalledWith(
      mockUserId,
      { name: 'KB 1', embeddingProvider: 'openai' },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' }
    );
    expect(sendSuccessResponseMock).toHaveBeenCalledWith(res, mockResult, HTTP_STATUS.CREATED);
  });

  it('should list user knowledge bases', async () => {
    const mockResult = {
      knowledgeBases: [{ id: mockKbId, name: 'KB 1' }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    vi.mocked(knowledgeBaseService.list).mockResolvedValue(
      mockResult as Awaited<ReturnType<typeof knowledgeBaseService.list>>
    );

    const req = createMockRequest();
    const res = createMockResponse();
    const next = await invokeHandler(knowledgeBaseController.list, req, res);

    expect(next).not.toHaveBeenCalled();
    expect(knowledgeBaseService.list).toHaveBeenCalledWith(mockUserId, undefined);
    expect(sendSuccessResponseMock).toHaveBeenCalledWith(res, mockResult);
  });

  it('should call next with validation error when kb id is invalid', async () => {
    const req = createMockRequest({ id: 'invalid-id' });
    const res = createMockResponse();
    const next = await invokeHandler(knowledgeBaseController.getById, req, res);

    expect(knowledgeBaseService.getById).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('should update knowledge base with context from request', async () => {
    const mockUpdated = { id: mockKbId, name: 'Renamed' };
    vi.mocked(knowledgeBaseService.update).mockResolvedValue(
      mockUpdated as Awaited<ReturnType<typeof knowledgeBaseService.update>>
    );

    const req = createMockRequest({ id: mockKbId }, { name: 'Renamed' });
    const res = createMockResponse({ name: 'Renamed' });
    const next = await invokeHandler(knowledgeBaseController.update, req, res);

    expect(next).not.toHaveBeenCalled();
    expect(knowledgeBaseService.update).toHaveBeenCalledWith(
      mockKbId,
      mockUserId,
      { name: 'Renamed' },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' }
    );
    expect(sendSuccessResponseMock).toHaveBeenCalledWith(res, mockUpdated);
  });

  it('should delete knowledge base and return success message', async () => {
    vi.mocked(knowledgeBaseService.delete).mockResolvedValue(undefined);

    const req = createMockRequest({ id: mockKbId });
    const res = createMockResponse();
    const next = await invokeHandler(knowledgeBaseController.delete, req, res);

    expect(next).not.toHaveBeenCalled();
    expect(knowledgeBaseService.delete).toHaveBeenCalledWith(mockKbId, mockUserId, {
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });
    expect(sendSuccessResponseMock).toHaveBeenCalledWith(res, {
      message: 'Knowledge base deleted successfully',
    });
  });
});
