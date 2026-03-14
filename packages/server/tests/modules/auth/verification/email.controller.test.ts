import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AUTH_ERROR_CODES, EMAIL_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@core/errors';
import { logTestInfo } from '@tests/__mocks__/email.mocks';

// ==================== Mocks ====================

vi.mock('@modules/auth/verification/email-verification.service', () => ({
  emailVerificationService: {
    sendCode: vi.fn(),
    verifyCode: vi.fn(),
  },
}));

vi.mock('@modules/user', () => ({
  userService: {
    existsByEmail: vi.fn(),
    findById: vi.fn(),
  },
  userController: {},
  userRepository: {},
}));

vi.mock('@core/utils/request.utils', () => ({
  getClientIp: vi.fn(() => '192.168.1.1'),
  requireUserId: vi.fn(),
  getParamId: vi.fn(),
  normalizeEmail: vi.fn((email: string) => email.toLowerCase().trim()),
}));

// Import after mocks
import { emailController } from '@modules/auth';
import { emailVerificationService } from '@modules/auth';
import { userService } from '@modules/user';

// ==================== Test Helpers ====================

function createMockReqRes(body: object = {}) {
  const req = { body } as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: { validated: { body } },
  } as unknown as Response;
  let nextError: Error | undefined;
  const next = vi.fn((err?: Error) => {
    nextError = err;
  }) as unknown as NextFunction;
  return { req, res, next, getNextError: () => nextError };
}

function getResponseData(res: Response) {
  const jsonCalls = vi.mocked(res.json).mock.calls;
  return jsonCalls[0]?.[0] as { success: boolean; data?: unknown; error?: { code: string } };
}

function getStatusCode(res: Response) {
  const statusCalls = vi.mocked(res.status).mock.calls;
  return statusCalls[0]?.[0] as number;
}

/**
 * Helper to call controller and wait for async completion
 * The asyncHandler wrapper starts the promise but doesn't return it,
 * so we need to use setImmediate to wait for microtasks to complete
 */
async function callController(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  handler(req, res, next);
  // Wait for all microtasks (promises) to resolve
  await new Promise((resolve) => setImmediate(resolve));
}

// ==================== sendCode ====================
// 场景：处理发送验证码请求
// 职责：校验邮箱是否已注册（注册场景） → 校验邮箱是否存在（重置密码场景） → 调用服务发送验证码
describe('emailController > sendCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：注册场景 — 正常发送
  // 应调用 emailVerificationService.sendCode 并返回成功响应
  it('should send verification code for registration', async () => {
    vi.mocked(userService.existsByEmail).mockResolvedValue(false);
    vi.mocked(emailVerificationService.sendCode).mockResolvedValue({
      expiresAt: new Date('2024-01-15T10:10:00Z'),
    });

    const { req, res, next } = createMockReqRes({ email: 'new@example.com', type: 'register' });
    await callController(emailController.sendCode, req, res, next);

    const response = getResponseData(res);
    logTestInfo(
      { email: 'new@example.com', type: 'register' },
      { success: true },
      { success: response?.success }
    );

    expect(response?.success).toBe(true);
    expect(getStatusCode(res)).toBe(200);
    expect(emailVerificationService.sendCode).toHaveBeenCalled();
  });

  // 场景 2：注册场景 — 邮箱已存在
  // 应将 EMAIL_ALREADY_EXISTS 错误传递给 next
  it('should return EMAIL_ALREADY_EXISTS when email is registered', async () => {
    vi.mocked(userService.existsByEmail).mockResolvedValue(true);

    const { req, res, next, getNextError } = createMockReqRes({
      email: 'existing@example.com',
      type: 'register',
    });
    await callController(emailController.sendCode, req, res, next);

    const error = getNextError() as AppError;
    logTestInfo(
      { email: 'existing@example.com', type: 'register', emailExists: true },
      { code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS },
      { code: error?.code }
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS);
  });

  // 场景 3：重置密码场景 — 邮箱存在
  // 应调用 emailVerificationService.sendCode 并返回成功
  it('should send verification code for password reset when email exists', async () => {
    vi.mocked(userService.existsByEmail).mockResolvedValue(true);
    vi.mocked(emailVerificationService.sendCode).mockResolvedValue({
      expiresAt: new Date('2024-01-15T10:10:00Z'),
    });

    const { req, res, next } = createMockReqRes({
      email: 'user@example.com',
      type: 'reset_password',
    });
    await callController(emailController.sendCode, req, res, next);

    const response = getResponseData(res);
    logTestInfo(
      { email: 'user@example.com', type: 'reset_password', emailExists: true },
      { success: true },
      { success: response?.success }
    );

    expect(response?.success).toBe(true);
    expect(emailVerificationService.sendCode).toHaveBeenCalled();
  });

  // 场景 4：重置密码场景 — 邮箱不存在
  // 应返回成功响应以防止邮箱枚举攻击
  it('should return success for non-existent email on password reset to prevent enumeration', async () => {
    vi.mocked(userService.existsByEmail).mockResolvedValue(false);

    const { req, res, next } = createMockReqRes({
      email: 'nonexist@example.com',
      type: 'reset_password',
    });
    await callController(emailController.sendCode, req, res, next);

    const response = getResponseData(res);
    logTestInfo(
      { email: 'nonexist@example.com', type: 'reset_password', emailExists: false },
      { success: true, sendCodeNotCalled: true },
      {
        success: response?.success,
        sendCodeNotCalled: !vi.mocked(emailVerificationService.sendCode).mock.calls.length,
      }
    );

    expect(response?.success).toBe(true);
    // Should NOT call sendCode for non-existent email
    expect(emailVerificationService.sendCode).not.toHaveBeenCalled();
  });

  // 场景 5：服务层抛出速率限制错误
  // 应将错误传递给 next
  it('should handle rate limit errors from service', async () => {
    vi.mocked(userService.existsByEmail).mockResolvedValue(false);
    vi.mocked(emailVerificationService.sendCode).mockRejectedValue(
      new AppError(EMAIL_ERROR_CODES.MAX_CODES_EXCEEDED, 'Too many codes', 429)
    );

    const { req, res, next, getNextError } = createMockReqRes({
      email: 'test@example.com',
      type: 'register',
    });
    await callController(emailController.sendCode, req, res, next);

    const error = getNextError() as AppError;
    logTestInfo(
      { serviceError: EMAIL_ERROR_CODES.MAX_CODES_EXCEEDED },
      { statusCode: 429, code: EMAIL_ERROR_CODES.MAX_CODES_EXCEEDED },
      { statusCode: error?.statusCode, code: error?.code }
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe(EMAIL_ERROR_CODES.MAX_CODES_EXCEEDED);
  });

  it('should send verification code for change_email when target email is available', async () => {
    vi.mocked(userService.existsByEmail).mockResolvedValue(false);
    vi.mocked(emailVerificationService.sendCode).mockResolvedValue({
      expiresAt: new Date('2024-01-15T10:10:00Z'),
    });

    const { req, res, next } = createMockReqRes({
      email: 'fresh@example.com',
      type: 'change_email',
    });
    await callController(emailController.sendCode, req, res, next);

    const response = getResponseData(res);
    logTestInfo(
      { email: 'fresh@example.com', type: 'change_email' },
      { success: true },
      { success: response?.success }
    );

    expect(response?.success).toBe(true);
    expect(emailVerificationService.sendCode).toHaveBeenCalledWith(
      'fresh@example.com',
      'change_email',
      '192.168.1.1'
    );
  });

  it('should return EMAIL_ALREADY_EXISTS when change_email target already exists', async () => {
    vi.mocked(userService.existsByEmail).mockResolvedValue(true);

    const { req, res, next, getNextError } = createMockReqRes({
      email: 'existing@example.com',
      type: 'change_email',
    });
    await callController(emailController.sendCode, req, res, next);

    const error = getNextError() as AppError;
    logTestInfo(
      { email: 'existing@example.com', type: 'change_email', emailExists: true },
      { code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS },
      { code: error?.code }
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS);
  });
});

// ==================== verifyCode ====================
// 场景：处理验证码校验请求
// 职责：调用服务验证验证码 → 返回验证令牌
describe('emailController > verifyCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：验证码正确
  // 应返回 verified: true 和 verificationToken
  it('should return verification token on valid code', async () => {
    vi.mocked(emailVerificationService.verifyCode).mockResolvedValue({
      verificationToken: 'jwt-token-here',
      expiresAt: new Date('2024-01-15T10:20:00Z'),
    });

    const { req, res, next } = createMockReqRes({
      email: 'test@example.com',
      code: '123456',
      type: 'register',
    });
    await callController(emailController.verifyCode, req, res, next);

    const response = getResponseData(res) as {
      success: boolean;
      data?: { verified: boolean; verificationToken: string; expiresAt: string };
    };
    logTestInfo(
      { email: 'test@example.com', code: '123456' },
      { verified: true, hasToken: true },
      { verified: response?.data?.verified, hasToken: !!response?.data?.verificationToken }
    );

    expect(response?.success).toBe(true);
    expect(response?.data?.verified).toBe(true);
    expect(response?.data?.verificationToken).toBe('jwt-token-here');
    expect(response?.data?.expiresAt).toBe('2024-01-15T10:20:00.000Z');
  });

  // 场景 2：验证码无效
  // 应将 CODE_INVALID 错误传递给 next
  it('should return CODE_INVALID error on invalid code', async () => {
    vi.mocked(emailVerificationService.verifyCode).mockRejectedValue(
      new AppError(EMAIL_ERROR_CODES.CODE_INVALID, 'Invalid or expired code', 400)
    );

    const { req, res, next, getNextError } = createMockReqRes({
      email: 'test@example.com',
      code: '000000',
      type: 'register',
    });
    await callController(emailController.verifyCode, req, res, next);

    const error = getNextError() as AppError;
    logTestInfo(
      { code: '000000' },
      { statusCode: 400, code: EMAIL_ERROR_CODES.CODE_INVALID },
      { statusCode: error?.statusCode, code: error?.code }
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(EMAIL_ERROR_CODES.CODE_INVALID);
  });

  // 场景 3：未知错误
  // 应将错误传递给 next
  it('should forward unexpected errors to next', async () => {
    vi.mocked(emailVerificationService.verifyCode).mockRejectedValue(
      new Error('DB connection lost')
    );

    const { req, res, next, getNextError } = createMockReqRes({
      email: 'test@example.com',
      code: '123456',
      type: 'register',
    });
    await callController(emailController.verifyCode, req, res, next);

    const error = getNextError() as Error;
    logTestInfo(
      { error: 'DB connection lost' },
      { forwarded: true },
      { forwarded: error?.message === 'DB connection lost' }
    );

    expect(next).toHaveBeenCalled();
    expect(error.message).toBe('DB connection lost');
  });
});
