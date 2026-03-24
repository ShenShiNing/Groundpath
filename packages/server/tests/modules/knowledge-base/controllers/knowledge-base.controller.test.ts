import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, RequestHandler } from 'express';
import { HTTP_STATUS } from '@groundpath/shared';
import type { DocumentListResponse } from '@groundpath/shared/types';

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

vi.mock('@modules/document/public/documents', () => ({
  documentService: {
    upload: vi.fn(),
    list: vi.fn(),
  },
}));

vi.mock('@core/errors', async (importOriginal) => {
  const original = await importOriginal<typeof import('@core/errors')>();
  return {
    ...original,
    sendSuccessResponse: sendSuccessResponseMock,
  };
});

import { knowledgeBaseController } from '@modules/knowledge-base/controllers/knowledge-base.controller';
import { knowledgeBaseService } from '@modules/knowledge-base/services/knowledge-base.service';
import { documentService } from '@modules/document/public/documents';

const mockUserId = 'user-123';
const mockKbId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const mockListedDocument = {
  id: 'doc-1',
  title: 'Doc 1',
  description: null,
  fileName: 'doc-1.txt',
  fileSize: 128,
  fileExtension: 'txt',
  documentType: 'text' as const,
  processingStatus: 'completed' as const,
  createdAt: new Date('2026-03-22T00:00:00.000Z'),
  updatedAt: new Date('2026-03-22T00:00:00.000Z'),
};

function createMockRequest(partial: Partial<Request> = {}): Request {
  return {
    user: { sub: mockUserId },
    params: {},
    body: {},
    headers: { 'user-agent': 'vitest' },
    ip: '127.0.0.1',
    socket: { remoteAddress: null },
    ...partial,
  } as unknown as Request;
}

function createMockResponse({
  body = {},
  query,
}: {
  body?: object;
  query?: object;
} = {}): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: { validated: { body, query } },
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

    const req = createMockRequest({ body: { name: 'KB 1', embeddingProvider: 'openai' } });
    const res = createMockResponse({ body: { name: 'KB 1', embeddingProvider: 'openai' } });
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
    const req = createMockRequest({ params: { id: 'invalid-id' } });
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

    const req = createMockRequest({ params: { id: mockKbId }, body: { name: 'Renamed' } });
    const res = createMockResponse({ body: { name: 'Renamed' } });
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

    const req = createMockRequest({ params: { id: mockKbId } });
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

  it('should upload knowledge-base document with decoded filename and request context', async () => {
    vi.mocked(documentService.upload).mockResolvedValue({ id: 'doc-1' } as Awaited<
      ReturnType<typeof documentService.upload>
    >);

    const encodedName = Buffer.from('测试.txt', 'utf-8').toString('latin1');
    const req = createMockRequest({
      params: { id: mockKbId },
      body: { title: 'Doc', description: 'Desc' },
      file: {
        buffer: Buffer.from('file'),
        mimetype: 'text/plain',
        originalname: encodedName,
        size: 4,
      } as Request['file'],
    });
    const res = createMockResponse({ body: { title: 'Doc', description: 'Desc' } });
    const next = await invokeHandler(knowledgeBaseController.uploadDocument, req, res);

    expect(next).not.toHaveBeenCalled();
    expect(documentService.upload).toHaveBeenCalledWith(
      mockUserId,
      expect.objectContaining({
        mimetype: 'text/plain',
        originalname: '测试.txt',
        size: 4,
      }),
      {
        title: 'Doc',
        description: 'Desc',
        knowledgeBaseId: mockKbId,
      },
      { ipAddress: '127.0.0.1', userAgent: 'vitest' }
    );
    expect(sendSuccessResponseMock).toHaveBeenCalledWith(
      res,
      { document: { id: 'doc-1' }, message: 'Document uploaded successfully' },
      HTTP_STATUS.CREATED
    );
  });

  it('should call next with validation error when upload document has invalid kb id', async () => {
    const req = createMockRequest({
      params: { id: 'invalid-id' },
      file: {
        buffer: Buffer.from('file'),
        mimetype: 'text/plain',
        originalname: 'test.txt',
        size: 4,
      } as Request['file'],
    });
    const res = createMockResponse();
    const next = await invokeHandler(knowledgeBaseController.uploadDocument, req, res);

    expect(documentService.upload).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('should call next with validation error when upload document file is missing', async () => {
    const req = createMockRequest({ params: { id: mockKbId } });
    const res = createMockResponse();
    const next = await invokeHandler(knowledgeBaseController.uploadDocument, req, res);

    expect(documentService.upload).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('should list documents in knowledge base with validated query', async () => {
    const query = { page: 2, pageSize: 10 };
    const mockResult: DocumentListResponse = {
      documents: [mockListedDocument],
      pagination: { page: 2, pageSize: 10, total: 1, totalPages: 1 },
    };
    vi.mocked(documentService.list).mockResolvedValue(mockResult);

    const req = createMockRequest({ params: { id: mockKbId } });
    const res = createMockResponse({ query });
    const next = await invokeHandler(knowledgeBaseController.listDocuments, req, res);

    expect(next).not.toHaveBeenCalled();
    expect(documentService.list).toHaveBeenCalledWith(mockUserId, {
      ...query,
      knowledgeBaseId: mockKbId,
    });
    expect(sendSuccessResponseMock).toHaveBeenCalledWith(res, mockResult);
  });
});
