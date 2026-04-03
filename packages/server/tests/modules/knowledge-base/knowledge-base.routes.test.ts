import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  generalRateLimiterMock,
  validateBodyMock,
  validateQueryMock,
  createSanitizeMiddlewareMock,
  requireKnowledgeBaseOwnershipMock,
  knowledgeBaseOwnershipMiddlewareMock,
  sanitizeMultipartFieldsMock,
  multerFactoryMock,
  multerMemoryStorageMock,
  multerSingleMock,
  MulterErrorMock,
  knowledgeBaseControllerMock,
  createKnowledgeBaseSchemaMock,
  updateKnowledgeBaseSchemaMock,
  knowledgeBaseDocumentListParamsSchemaMock,
  knowledgeBaseListParamsSchemaMock,
  knowledgeBaseDocumentUploadMetadataSchemaMock,
  createKbValidatorMock,
  updateKbValidatorMock,
  documentListValidatorMock,
  knowledgeBaseListValidatorMock,
  uploadDocumentValidatorMock,
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
  const listParamsSchema = { type: 'knowledge-base-document-list-schema' };
  const knowledgeBaseListSchema = { type: 'knowledge-base-list-schema' };
  const knowledgeBaseDocumentUploadMetadataSchema = {
    type: 'knowledge-base-document-upload-metadata-schema',
  };
  const createKbValidator = vi.fn();
  const updateKbValidator = vi.fn();
  const listValidator = vi.fn();
  const knowledgeBaseListValidator = vi.fn();
  const uploadDocumentValidator = vi.fn();
  const sanitizeMultipartFields = vi.fn();
  const knowledgeBaseOwnershipMiddleware = vi.fn();

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
      if (schema === knowledgeBaseDocumentUploadMetadataSchema) {
        return uploadDocumentValidator;
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
    createSanitizeMiddlewareMock: vi.fn(() => sanitizeMultipartFields),
    requireKnowledgeBaseOwnershipMock: vi.fn(() => knowledgeBaseOwnershipMiddleware),
    knowledgeBaseOwnershipMiddlewareMock: knowledgeBaseOwnershipMiddleware,
    sanitizeMultipartFieldsMock: sanitizeMultipartFields,
    multerFactoryMock: hoistedMulterFactory,
    multerMemoryStorageMock: hoistedMulterMemoryStorage,
    multerSingleMock: hoistedMulterSingle,
    MulterErrorMock: HoistedMulterError,
    knowledgeBaseControllerMock: {
      create: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      uploadDocument: vi.fn(),
      listDocuments: vi.fn(),
    },
    createKnowledgeBaseSchemaMock: createKbSchema,
    updateKnowledgeBaseSchemaMock: updateKbSchema,
    knowledgeBaseDocumentListParamsSchemaMock: listParamsSchema,
    knowledgeBaseListParamsSchemaMock: knowledgeBaseListSchema,
    knowledgeBaseDocumentUploadMetadataSchemaMock: knowledgeBaseDocumentUploadMetadataSchema,
    createKbValidatorMock: createKbValidator,
    updateKbValidatorMock: updateKbValidator,
    documentListValidatorMock: listValidator,
    knowledgeBaseListValidatorMock: knowledgeBaseListValidator,
    uploadDocumentValidatorMock: uploadDocumentValidator,
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
}));

vi.mock('@modules/knowledge-base/public/ownership', () => ({
  requireKnowledgeBaseOwnership: requireKnowledgeBaseOwnershipMock,
}));

vi.mock('@groundpath/shared/schemas', () => ({
  createKnowledgeBaseSchema: createKnowledgeBaseSchemaMock,
  updateKnowledgeBaseSchema: updateKnowledgeBaseSchemaMock,
  knowledgeBaseDocumentListParamsSchema: knowledgeBaseDocumentListParamsSchemaMock,
  knowledgeBaseListParamsSchema: knowledgeBaseListParamsSchemaMock,
  knowledgeBaseDocumentUploadMetadataSchema: knowledgeBaseDocumentUploadMetadataSchemaMock,
}));

import knowledgeBaseRoutes from '@modules/knowledge-base/knowledge-base.routes';

function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function getDocumentUploadMiddleware() {
  const uploadRouteCall = mockRouter.post.mock.calls.find((call) => call[0] === '/:id/documents');
  return uploadRouteCall?.[2] as
    | ((req: Request, res: Response, next: NextFunction) => void)
    | undefined;
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
    expect(validateBodyMock).toHaveBeenCalledWith(knowledgeBaseDocumentUploadMetadataSchemaMock);
    expect(validateQueryMock).toHaveBeenCalledWith(knowledgeBaseDocumentListParamsSchemaMock);
    expect(validateQueryMock).toHaveBeenCalledWith(knowledgeBaseListParamsSchemaMock);
    expect(requireKnowledgeBaseOwnershipMock).toHaveBeenCalledTimes(5);

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
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/:id',
      knowledgeBaseOwnershipMiddlewareMock,
      knowledgeBaseControllerMock.getById
    );
    expect(mockRouter.patch).toHaveBeenCalledWith(
      '/:id',
      updateKbValidatorMock,
      knowledgeBaseOwnershipMiddlewareMock,
      knowledgeBaseControllerMock.update
    );
    expect(mockRouter.delete).toHaveBeenCalledWith(
      '/:id',
      knowledgeBaseOwnershipMiddlewareMock,
      knowledgeBaseControllerMock.delete
    );
  });

  it('should register document routes with controller handlers', () => {
    expect(validateQueryMock).toHaveBeenCalledWith(knowledgeBaseDocumentListParamsSchemaMock);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/documents',
      generalRateLimiterMock,
      expect.any(Function),
      sanitizeMultipartFieldsMock,
      uploadDocumentValidatorMock,
      knowledgeBaseOwnershipMiddlewareMock,
      knowledgeBaseControllerMock.uploadDocument
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/:id/documents',
      documentListValidatorMock,
      knowledgeBaseOwnershipMiddlewareMock,
      knowledgeBaseControllerMock.listDocuments
    );
  });

  it('should return file-size error when multer emits LIMIT_FILE_SIZE', () => {
    const uploadMiddleware = getDocumentUploadMiddleware();
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
    const uploadMiddleware = getDocumentUploadMiddleware();
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
});
