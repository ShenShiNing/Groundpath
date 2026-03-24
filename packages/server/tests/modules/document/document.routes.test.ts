import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  validateBodyMock,
  validateQueryMock,
  createSanitizeMiddlewareMock,
  sanitizeMultipartFieldsMock,
  sanitizeInlineContentMock,
  updateDocumentRequestSchemaMock,
  documentListParamsSchemaMock,
  trashListParamsSchemaMock,
  saveDocumentContentSchemaMock,
  documentUploadMetadataSchemaMock,
  documentVersionUploadMetadataSchemaMock,
  updateValidatorMock,
  listValidatorMock,
  trashListValidatorMock,
  saveContentValidatorMock,
  uploadValidatorMock,
  uploadVersionValidatorMock,
  documentControllerMock,
  multerFactoryMock,
  multerMemoryStorageMock,
  multerSingleMock,
  MulterErrorMock,
  documentConfigMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  const updateDocumentRequestSchema = { type: 'update-document-schema' };
  const documentListParamsSchema = { type: 'document-list-schema' };
  const trashListParamsSchema = { type: 'trash-list-schema' };
  const saveDocumentContentSchema = { type: 'save-document-content-schema' };
  const documentUploadMetadataSchema = { type: 'document-upload-metadata-schema' };
  const documentVersionUploadMetadataSchema = { type: 'document-version-upload-metadata-schema' };

  const updateValidator = vi.fn();
  const listValidator = vi.fn();
  const trashListValidator = vi.fn();
  const saveContentValidator = vi.fn();
  const uploadValidator = vi.fn();
  const uploadVersionValidator = vi.fn();

  const sanitizeMultipartFields = vi.fn();
  const sanitizeInlineContent = vi.fn();
  let sanitizeCallCount = 0;

  const createSanitizeMiddleware = vi.fn(() => {
    sanitizeCallCount++;
    return sanitizeCallCount === 1 ? sanitizeMultipartFields : sanitizeInlineContent;
  });

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

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    validateBodyMock: vi.fn((schema: unknown) => {
      if (schema === updateDocumentRequestSchema) return updateValidator;
      if (schema === saveDocumentContentSchema) return saveContentValidator;
      if (schema === documentUploadMetadataSchema) return uploadValidator;
      if (schema === documentVersionUploadMetadataSchema) return uploadVersionValidator;
      return vi.fn();
    }),
    validateQueryMock: vi.fn((schema: unknown) => {
      if (schema === documentListParamsSchema) return listValidator;
      if (schema === trashListParamsSchema) return trashListValidator;
      return vi.fn();
    }),
    createSanitizeMiddlewareMock: createSanitizeMiddleware,
    sanitizeMultipartFieldsMock: sanitizeMultipartFields,
    sanitizeInlineContentMock: sanitizeInlineContent,
    updateDocumentRequestSchemaMock: updateDocumentRequestSchema,
    documentListParamsSchemaMock: documentListParamsSchema,
    trashListParamsSchemaMock: trashListParamsSchema,
    saveDocumentContentSchemaMock: saveDocumentContentSchema,
    documentUploadMetadataSchemaMock: documentUploadMetadataSchema,
    documentVersionUploadMetadataSchemaMock: documentVersionUploadMetadataSchema,
    updateValidatorMock: updateValidator,
    listValidatorMock: listValidator,
    trashListValidatorMock: trashListValidator,
    saveContentValidatorMock: saveContentValidator,
    uploadValidatorMock: uploadValidator,
    uploadVersionValidatorMock: uploadVersionValidator,
    documentControllerMock: {
      listTrash: vi.fn(),
      clearTrash: vi.fn(),
      restore: vi.fn(),
      permanentDelete: vi.fn(),
      upload: vi.fn(),
      list: vi.fn(),
      getContent: vi.fn(),
      saveContent: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      download: vi.fn(),
      preview: vi.fn(),
      getVersionHistory: vi.fn(),
      uploadNewVersion: vi.fn(),
      restoreVersion: vi.fn(),
    },
    multerFactoryMock: hoistedMulterFactory,
    multerMemoryStorageMock: hoistedMulterMemoryStorage,
    multerSingleMock: hoistedMulterSingle,
    MulterErrorMock: HoistedMulterError,
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

vi.mock('@modules/document/controllers/document.controller', () => ({
  documentController: documentControllerMock,
}));

vi.mock('@core/middleware', () => ({
  authenticate: authenticateMock,
  validateBody: validateBodyMock,
  validateQuery: validateQueryMock,
  createSanitizeMiddleware: createSanitizeMiddlewareMock,
  generalRateLimiter: vi.fn(),
}));

vi.mock('@groundpath/shared/schemas', () => ({
  updateDocumentRequestSchema: updateDocumentRequestSchemaMock,
  documentListParamsSchema: documentListParamsSchemaMock,
  trashListParamsSchema: trashListParamsSchemaMock,
  saveDocumentContentSchema: saveDocumentContentSchemaMock,
  documentUploadMetadataSchema: documentUploadMetadataSchemaMock,
  documentVersionUploadMetadataSchema: documentVersionUploadMetadataSchemaMock,
}));

import documentRoutes from '@modules/document/document.routes';

function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function getUploadMiddlewareByPath(path: string) {
  const routeCall = mockRouter.post.mock.calls.find((call) => call[0] === path);
  return routeCall?.[2] as ((req: Request, res: Response, next: NextFunction) => void) | undefined;
}

describe('document.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(documentRoutes).toBe(mockRouter);
  });

  it('should configure multer with memory storage and max size', () => {
    expect(multerMemoryStorageMock).toHaveBeenCalledTimes(1);
    expect(multerFactoryMock).toHaveBeenCalledWith({
      storage: { type: 'memory-storage' },
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: expect.any(Function),
    });
  });

  it('should register auth middleware and validators', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(authenticateMock);

    expect(validateQueryMock).toHaveBeenCalledWith(documentListParamsSchemaMock);
    expect(validateQueryMock).toHaveBeenCalledWith(trashListParamsSchemaMock);

    expect(validateBodyMock).toHaveBeenCalledWith(updateDocumentRequestSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(saveDocumentContentSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(documentUploadMetadataSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(documentVersionUploadMetadataSchemaMock);
    expect(createSanitizeMiddlewareMock).toHaveBeenCalledWith(['changeNote']);
  });

  it('should register trash endpoints', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/trash',
      trashListValidatorMock,
      documentControllerMock.listTrash
    );
    expect(mockRouter.delete).toHaveBeenCalledWith('/trash', documentControllerMock.clearTrash);
    expect(mockRouter.post).toHaveBeenCalledWith('/:id/restore', documentControllerMock.restore);
    expect(mockRouter.delete).toHaveBeenCalledWith(
      '/:id/permanent',
      documentControllerMock.permanentDelete
    );
  });

  it('should register document endpoints', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/',
      expect.any(Function),
      [expect.any(Function), sanitizeMultipartFieldsMock],
      uploadValidatorMock,
      documentControllerMock.upload
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/',
      listValidatorMock,
      documentControllerMock.list
    );
    expect(mockRouter.get).toHaveBeenCalledWith('/:id/content', documentControllerMock.getContent);
    expect(mockRouter.put).toHaveBeenCalledWith(
      '/:id/content',
      sanitizeInlineContentMock,
      saveContentValidatorMock,
      documentControllerMock.saveContent
    );
    expect(mockRouter.get).toHaveBeenCalledWith('/:id', documentControllerMock.getById);
    expect(mockRouter.patch).toHaveBeenCalledWith(
      '/:id',
      updateValidatorMock,
      documentControllerMock.update
    );
    expect(mockRouter.delete).toHaveBeenCalledWith('/:id', documentControllerMock.delete);
    expect(mockRouter.get).toHaveBeenCalledWith('/:id/download', documentControllerMock.download);
    expect(mockRouter.get).toHaveBeenCalledWith('/:id/preview', documentControllerMock.preview);
  });

  it('should register version endpoints', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/:id/versions',
      documentControllerMock.getVersionHistory
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/versions',
      expect.any(Function),
      [expect.any(Function), sanitizeMultipartFieldsMock],
      uploadVersionValidatorMock,
      documentControllerMock.uploadNewVersion
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:id/versions/:versionId/restore',
      documentControllerMock.restoreVersion
    );
  });

  it('should return file-size error for upload middleware', () => {
    const uploadMiddleware = getUploadMiddlewareByPath('/');
    expect(uploadMiddleware).toBeTypeOf('function');

    multerSingleMock.mockReturnValueOnce(
      (_req: Request, _res: Response, cb: (err?: unknown) => void) =>
        cb(new MulterErrorMock('LIMIT_FILE_SIZE', 'too large'))
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

  it('should return invalid-file-type error for upload middleware', () => {
    const uploadMiddleware = getUploadMiddlewareByPath('/');
    expect(uploadMiddleware).toBeTypeOf('function');

    multerSingleMock.mockReturnValueOnce(
      (_req: Request, _res: Response, cb: (err?: unknown) => void) =>
        cb(new MulterErrorMock('LIMIT_UNEXPECTED_FILE', 'invalid file'))
    );

    const req = {} as Request;
    const res = createMockResponse();
    const next = vi.fn();

    uploadMiddleware!(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INVALID_FILE_TYPE',
        message: 'Invalid file type. Allowed extensions: pdf, md, markdown, txt, docx',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
