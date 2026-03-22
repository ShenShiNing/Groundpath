import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  generalRateLimiterMock,
  validateBodyMock,
  validateQueryMock,
  getValidatedQueryMock,
  createSanitizeMiddlewareMock,
  sanitizeMultipartFieldsMock,
  asyncHandlerMock,
  multerFactoryMock,
  multerMemoryStorageMock,
  multerSingleMock,
  MulterErrorMock,
  AppErrorMock,
  knowledgeBaseControllerMock,
  createKnowledgeBaseSchemaMock,
  updateKnowledgeBaseSchemaMock,
  documentListParamsSchemaMock,
  knowledgeBaseListParamsSchemaMock,
  createKbValidatorMock,
  updateKbValidatorMock,
  documentListValidatorMock,
  knowledgeBaseListValidatorMock,
  documentServiceMock,
  sendSuccessResponseMock,
  requireUserIdMock,
  getParamIdMock,
  getClientIpMock,
  documentConfigMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  const hoistedMulterSingle = vi.fn();
  const hoistedMulterMemoryStorage = vi.fn(() => ({ type: 'memory-storage' }));
  class HoistedMulterError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message);
      this.code = code;
    }
  }

  const hoistedMulterFactory = Object.assign(
    vi.fn(() => ({
      single: hoistedMulterSingle,
    })),
    {
      memoryStorage: hoistedMulterMemoryStorage,
      MulterError: HoistedMulterError,
    }
  );

  const createKbSchema = { type: 'create-kb-schema' };
  const updateKbSchema = { type: 'update-kb-schema' };
  const listParamsSchema = { type: 'document-list-schema' };
  const knowledgeBaseListSchema = { type: 'knowledge-base-list-schema' };

  const createKbValidator = vi.fn();
  const updateKbValidator = vi.fn();
  const listValidator = vi.fn();
  const knowledgeBaseListValidator = vi.fn();
  const sanitizeMultipartFields = vi.fn();
  const getValidatedQuery = vi.fn();
  const sendSuccessResponse = vi.fn();
  const requireUserId = vi.fn();
  const getParamId = vi.fn();
  const getClientIp = vi.fn();

  class HoistedAppError extends Error {
    code: string;
    statusCode: number;

    constructor(code: string, message: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }

  const documentService = {
    upload: vi.fn(),
    list: vi.fn(),
  };

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    generalRateLimiterMock: vi.fn(),
    validateBodyMock: vi.fn((schema: unknown) => {
      if (schema === createKbSchema) {
        return createKbValidator;
      }
      if (schema === updateKbSchema) {
        return updateKbValidator;
      }
      return vi.fn();
    }),
    validateQueryMock: vi.fn((schema: unknown) => {
      if (schema === listParamsSchema) {
        return listValidator;
      }
      if (schema === knowledgeBaseListSchema) {
        return knowledgeBaseListValidator;
      }
      return vi.fn();
    }),
    getValidatedQueryMock: getValidatedQuery,
    createSanitizeMiddlewareMock: vi.fn(() => sanitizeMultipartFields),
    sanitizeMultipartFieldsMock: sanitizeMultipartFields,
    asyncHandlerMock: vi.fn((handler: unknown) => handler),
    multerFactoryMock: hoistedMulterFactory,
    multerMemoryStorageMock: hoistedMulterMemoryStorage,
    multerSingleMock: hoistedMulterSingle,
    MulterErrorMock: HoistedMulterError,
    AppErrorMock: HoistedAppError,
    knowledgeBaseControllerMock: {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    createKnowledgeBaseSchemaMock: createKbSchema,
    updateKnowledgeBaseSchemaMock: updateKbSchema,
    documentListParamsSchemaMock: listParamsSchema,
    knowledgeBaseListParamsSchemaMock: knowledgeBaseListSchema,
    createKbValidatorMock: createKbValidator,
    updateKbValidatorMock: updateKbValidator,
    documentListValidatorMock: listValidator,
    knowledgeBaseListValidatorMock: knowledgeBaseListValidator,
    documentServiceMock: documentService,
    sendSuccessResponseMock: sendSuccessResponse,
    requireUserIdMock: requireUserId,
    getParamIdMock: getParamId,
    getClientIpMock: getClientIp,
    documentConfigMock: {
      maxSize: 5 * 1024 * 1024,
    },
  };
});

vi.mock('express', () => ({
  default: { Router: RouterMock },
  Router: RouterMock,
}));

vi.mock('multer', () => ({
  default: multerFactoryMock,
}));

vi.mock('@config/env', () => ({
  documentConfig: documentConfigMock,
}));

vi.mock('@modules/knowledge-base/controllers/knowledge-base.controller', () => ({
  knowledgeBaseController: knowledgeBaseControllerMock,
}));

vi.mock('@core/middleware', () => ({
  authenticate: authenticateMock,
  generalRateLimiter: generalRateLimiterMock,
  validateBody: validateBodyMock,
  validateQuery: validateQueryMock,
  createSanitizeMiddleware: createSanitizeMiddlewareMock,
  getValidatedQuery: getValidatedQueryMock,
}));

vi.mock('@groundpath/shared/schemas', () => ({
  createKnowledgeBaseSchema: createKnowledgeBaseSchemaMock,
  updateKnowledgeBaseSchema: updateKnowledgeBaseSchemaMock,
  documentListParamsSchema: documentListParamsSchemaMock,
  knowledgeBaseListParamsSchema: knowledgeBaseListParamsSchemaMock,
}));

vi.mock('@modules/document', () => ({
  documentService: documentServiceMock,
}));

vi.mock('@core/errors', () => ({
  sendSuccessResponse: sendSuccessResponseMock,
}));

vi.mock('@core/errors/app-error', () => ({
  AppError: AppErrorMock,
}));

vi.mock('@core/errors/async-handler', () => ({
  asyncHandler: asyncHandlerMock,
}));

vi.mock('@core/utils', () => ({
  requireUserId: requireUserIdMock,
  getParamId: getParamIdMock,
  getClientIp: getClientIpMock,
}));

vi.mock('@groundpath/shared', () => ({
  HTTP_STATUS: {
    CREATED: 201,
  },
}));

import knowledgeBaseRoutes from '@modules/knowledge-base/knowledge-base.routes';
import { documentService } from '@modules/document';
import { sendSuccessResponse } from '@core/errors';
import { requireUserId, getParamId, getClientIp } from '@core/utils';
import { getValidatedQuery } from '@core/middleware';

function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function createMockRequest(partial: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    headers: {},
    ...partial,
  } as unknown as Request;
}

function getDocumentUploadHandler() {
  const uploadRouteCall = mockRouter.post.mock.calls.find((call) => call[0] === '/:id/documents');
  return uploadRouteCall?.[4] as ((req: Request, res: Response) => Promise<void>) | undefined;
}

function getDocumentListHandler() {
  const listRouteCall = mockRouter.get.mock.calls.find((call) => call[0] === '/:id/documents');
  return listRouteCall?.[2] as ((req: Request, res: Response) => Promise<void>) | undefined;
}

describe('knowledge-base.routes', () => {
  it('should create router and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(knowledgeBaseRoutes).toBe(mockRouter);
  });

  it('should configure multer with memory storage and max file size', () => {
    expect(multerMemoryStorageMock).toHaveBeenCalledTimes(1);
    expect(multerFactoryMock).toHaveBeenCalledWith({
      storage: { type: 'memory-storage' },
      limits: { fileSize: 5 * 1024 * 1024 },
    });
  });

  it('should register authentication middleware', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(authenticateMock);
  });

  it('should register knowledge base crud routes with validators', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(createKnowledgeBaseSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(updateKnowledgeBaseSchemaMock);
    expect(validateQueryMock).toHaveBeenCalledWith(documentListParamsSchemaMock);
    expect(validateQueryMock).toHaveBeenCalledWith(knowledgeBaseListParamsSchemaMock);

    expect(mockRouter.post).toHaveBeenCalledWith(
      '/',
      createKbValidatorMock,
      knowledgeBaseControllerMock.create
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/',
      knowledgeBaseListValidatorMock,
      knowledgeBaseControllerMock.list
    );
    expect(mockRouter.get).toHaveBeenCalledWith('/:id', knowledgeBaseControllerMock.getById);
    expect(mockRouter.patch).toHaveBeenCalledWith(
      '/:id',
      updateKbValidatorMock,
      knowledgeBaseControllerMock.update
    );
    expect(mockRouter.delete).toHaveBeenCalledWith('/:id', knowledgeBaseControllerMock.delete);
  });

  it('should register document routes with async handlers', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/documents',
      generalRateLimiterMock,
      expect.any(Function),
      sanitizeMultipartFieldsMock,
      expect.any(Function)
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/:id/documents',
      documentListValidatorMock,
      expect.any(Function)
    );
    expect(asyncHandlerMock).toHaveBeenCalledTimes(2);
  });

  it('should return file-size error when multer emits LIMIT_FILE_SIZE', () => {
    const uploadRouteCall = mockRouter.post.mock.calls.find((call) => call[0] === '/:id/documents');
    const uploadMiddleware = uploadRouteCall?.[2] as
      | ((req: Request, res: Response, next: NextFunction) => void)
      | undefined;

    expect(uploadMiddleware).toBeTypeOf('function');

    multerSingleMock.mockReturnValueOnce(
      (_req: Request, _res: Response, cb: (err?: unknown) => void) =>
        cb(new MulterErrorMock('LIMIT_FILE_SIZE', 'too big'))
    );

    const req = {} as Request;
    const res = createMockResponse();
    const next = vi.fn();

    uploadMiddleware!(req, res, next);

    expect(multerSingleMock).toHaveBeenCalledWith('file');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'File too large. Maximum size is 5MB',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return upload error payload for other multer errors', () => {
    const uploadRouteCall = mockRouter.post.mock.calls.find((call) => call[0] === '/:id/documents');
    const uploadMiddleware = uploadRouteCall?.[2] as
      | ((req: Request, res: Response, next: NextFunction) => void)
      | undefined;

    expect(uploadMiddleware).toBeTypeOf('function');

    multerSingleMock.mockReturnValueOnce(
      (_req: Request, _res: Response, cb: (err?: unknown) => void) =>
        cb(new MulterErrorMock('LIMIT_UNEXPECTED_FILE', 'bad file field'))
    );

    const req = {} as Request;
    const res = createMockResponse();
    const next = vi.fn();

    uploadMiddleware!(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: 'bad file field',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  describe('business handlers', () => {
    const validKbId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    beforeEach(() => {
      vi.mocked(documentService.upload).mockReset();
      vi.mocked(documentService.list).mockReset();
      vi.mocked(sendSuccessResponse).mockReset();
      vi.mocked(requireUserId).mockReset();
      vi.mocked(getParamId).mockReset();
      vi.mocked(getClientIp).mockReset();
      vi.mocked(getValidatedQuery).mockReset();
    });

    it('should upload document successfully with decoded filename and request context', async () => {
      const handler = getDocumentUploadHandler();
      expect(handler).toBeTypeOf('function');

      vi.mocked(requireUserId).mockReturnValue('user-1');
      vi.mocked(getParamId).mockReturnValue(validKbId);
      vi.mocked(getClientIp).mockReturnValue('127.0.0.1');
      vi.mocked(documentService.upload).mockResolvedValue({ id: 'doc-1' } as never);

      const encodedName = Buffer.from('测试.txt', 'utf-8').toString('latin1');
      const req = createMockRequest({
        params: { id: validKbId },
        file: {
          buffer: Buffer.from('file'),
          mimetype: 'text/plain',
          originalname: encodedName,
          size: 4,
        } as Request['file'],
        body: {
          title: 't',
          description: 'd',
        },
        headers: { 'user-agent': 'vitest-agent' },
      });
      const res = createMockResponse();

      await handler!(req, res);

      expect(documentService.upload).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          mimetype: 'text/plain',
          originalname: '测试.txt',
          size: 4,
        }),
        {
          title: 't',
          description: 'd',
          knowledgeBaseId: validKbId,
        },
        { ipAddress: '127.0.0.1', userAgent: 'vitest-agent' }
      );
      expect(sendSuccessResponse).toHaveBeenCalledWith(
        res,
        { document: { id: 'doc-1' }, message: 'Document uploaded successfully' },
        201
      );
    });

    it('should throw validation error when upload has invalid kb id', async () => {
      const handler = getDocumentUploadHandler();
      expect(handler).toBeTypeOf('function');

      vi.mocked(requireUserId).mockReturnValue('user-1');
      vi.mocked(getParamId).mockReturnValue('invalid-id');

      const req = createMockRequest({
        params: { id: 'invalid-id' },
        file: {
          buffer: Buffer.from('x'),
          mimetype: 'text/plain',
          originalname: 'x.txt',
          size: 1,
        } as Request['file'],
      });
      const res = createMockResponse();

      await expect(handler!(req, res)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
      expect(documentService.upload).not.toHaveBeenCalled();
    });

    it('should throw validation error when upload has no file', async () => {
      const handler = getDocumentUploadHandler();
      expect(handler).toBeTypeOf('function');

      vi.mocked(requireUserId).mockReturnValue('user-1');
      vi.mocked(getParamId).mockReturnValue(validKbId);

      const req = createMockRequest({ params: { id: validKbId } });
      const res = createMockResponse();

      await expect(handler!(req, res)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
      expect(documentService.upload).not.toHaveBeenCalled();
    });

    it('should list documents successfully', async () => {
      const handler = getDocumentListHandler();
      expect(handler).toBeTypeOf('function');

      const query = { page: 2, pageSize: 10 };
      const result = { data: [{ id: 'doc-1' }], total: 1 };

      vi.mocked(requireUserId).mockReturnValue('user-1');
      vi.mocked(getParamId).mockReturnValue(validKbId);
      vi.mocked(getValidatedQuery).mockReturnValue(query);
      vi.mocked(documentService.list).mockResolvedValue(result as never);

      const req = createMockRequest({ params: { id: validKbId } });
      const res = createMockResponse();

      await handler!(req, res);

      expect(getValidatedQuery).toHaveBeenCalledWith(res);
      expect(documentService.list).toHaveBeenCalledWith('user-1', {
        ...query,
        knowledgeBaseId: validKbId,
      });
      expect(sendSuccessResponse).toHaveBeenCalledWith(res, result);
    });

    it('should throw validation error when listing documents with invalid kb id', async () => {
      const handler = getDocumentListHandler();
      expect(handler).toBeTypeOf('function');

      vi.mocked(requireUserId).mockReturnValue('user-1');
      vi.mocked(getParamId).mockReturnValue('invalid-id');

      const req = createMockRequest({ params: { id: 'invalid-id' } });
      const res = createMockResponse();

      await expect(handler!(req, res)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
      expect(documentService.list).not.toHaveBeenCalled();
    });
  });
});
