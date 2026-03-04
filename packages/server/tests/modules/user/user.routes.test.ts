import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  validateBodyMock,
  updateProfileRequestSchemaMock,
  profileValidatorMock,
  userControllerMock,
  uploadControllerMock,
  multerFactoryMock,
  multerMemoryStorageMock,
  multerSingleMock,
  MulterErrorMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    patch: vi.fn(),
    post: vi.fn(),
  };

  const updateProfileRequestSchema = { type: 'update-profile-schema' };
  const profileValidator = vi.fn();

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
    validateBodyMock: vi.fn((schema: unknown) =>
      schema === updateProfileRequestSchema ? profileValidator : vi.fn()
    ),
    updateProfileRequestSchemaMock: updateProfileRequestSchema,
    profileValidatorMock: profileValidator,
    userControllerMock: {
      updateProfile: vi.fn(),
    },
    uploadControllerMock: {
      uploadAvatar: vi.fn(),
    },
    multerFactoryMock: hoistedMulterFactory,
    multerMemoryStorageMock: hoistedMulterMemoryStorage,
    multerSingleMock: hoistedMulterSingle,
    MulterErrorMock: HoistedMulterError,
  };
});

vi.mock('express', () => ({
  default: { Router: RouterMock },
  Router: RouterMock,
}));

vi.mock('multer', () => ({
  default: multerFactoryMock,
}));

vi.mock('@shared/middleware', () => ({
  authenticate: authenticateMock,
  validateBody: validateBodyMock,
}));

vi.mock('@knowledge-agent/shared/schemas', () => ({
  updateProfileRequestSchema: updateProfileRequestSchemaMock,
}));

vi.mock('@modules/user/controllers/user.controller', () => ({
  userController: userControllerMock,
}));

vi.mock('@modules/document/controllers/upload.controller', () => ({
  uploadController: uploadControllerMock,
}));

import userRoutes from '@modules/user/user.routes';

function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('user.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(userRoutes).toBe(mockRouter);
  });

  it('should configure multer for avatar uploads with 2MB limit', () => {
    expect(multerMemoryStorageMock).toHaveBeenCalledTimes(1);
    expect(multerFactoryMock).toHaveBeenCalledWith({
      storage: { type: 'memory-storage' },
      limits: {
        fileSize: 2 * 1024 * 1024,
      },
    });
  });

  it('should register profile and avatar endpoints', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(updateProfileRequestSchemaMock);

    expect(mockRouter.patch).toHaveBeenCalledWith(
      '/profile',
      authenticateMock,
      profileValidatorMock,
      userControllerMock.updateProfile
    );

    expect(mockRouter.post).toHaveBeenCalledWith(
      '/avatar',
      authenticateMock,
      expect.any(Function),
      uploadControllerMock.uploadAvatar
    );
  });

  it('should return file-size error when avatar exceeds limit', () => {
    const uploadRouteCall = mockRouter.post.mock.calls.find((call) => call[0] === '/avatar');
    const uploadMiddleware = uploadRouteCall?.[2] as
      | ((req: Request, res: Response, next: NextFunction) => void)
      | undefined;

    expect(uploadMiddleware).toBeTypeOf('function');

    multerSingleMock.mockReturnValueOnce(
      (_req: Request, _res: Response, cb: (err?: unknown) => void) =>
        cb(new MulterErrorMock('LIMIT_FILE_SIZE', 'file too large'))
    );

    const req = {} as Request;
    const res = createMockResponse();
    const next = vi.fn();

    uploadMiddleware!(req, res, next);

    expect(multerSingleMock).toHaveBeenCalledWith('avatar');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'Avatar file too large. Maximum size is 2MB',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return upload error payload for multer errors', () => {
    const uploadRouteCall = mockRouter.post.mock.calls.find((call) => call[0] === '/avatar');
    const uploadMiddleware = uploadRouteCall?.[2] as
      | ((req: Request, res: Response, next: NextFunction) => void)
      | undefined;

    expect(uploadMiddleware).toBeTypeOf('function');

    multerSingleMock.mockReturnValueOnce(
      (_req: Request, _res: Response, cb: (err?: unknown) => void) =>
        cb(new MulterErrorMock('LIMIT_UNEXPECTED_FILE', 'unexpected field'))
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
        message: 'unexpected field',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass non-multer errors to next middleware', () => {
    const uploadRouteCall = mockRouter.post.mock.calls.find((call) => call[0] === '/avatar');
    const uploadMiddleware = uploadRouteCall?.[2] as
      | ((req: Request, res: Response, next: NextFunction) => void)
      | undefined;

    expect(uploadMiddleware).toBeTypeOf('function');

    const unknownError = new Error('unknown upload error');
    multerSingleMock.mockReturnValueOnce(
      (_req: Request, _res: Response, cb: (err?: unknown) => void) => cb(unknownError)
    );

    const req = {} as Request;
    const res = createMockResponse();
    const next = vi.fn();

    uploadMiddleware!(req, res, next);

    expect(next).toHaveBeenCalledWith(unknownError);
  });
});
