import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { EMAIL_ERROR_CODES } from '@knowledge-agent/shared';
import { authConfig } from '@config/env';
import { AppError } from '@shared/errors';
import {
  mockEmail,
  mockCode,
  mockIpAddress,
  mockVerificationCode,
  logTestInfo,
} from '@tests/__mocks__/email.mocks';

// ==================== Mocks ====================

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-code-uuid'),
}));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomInt: vi.fn(() => 123456),
  };
});

vi.mock('@modules/auth/verification/email-verification.repository', () => ({
  emailVerificationRepository: {
    countRecentCodes: vi.fn(),
    getMostRecentCode: vi.fn(),
    getMostRecentCodeWithAge: vi.fn(),
    invalidateAllForEmail: vi.fn(),
    create: vi.fn(),
    findValidCode: vi.fn(),
    markAsUsed: vi.fn(),
  },
}));

vi.mock('@modules/auth/verification/email.service', () => ({
  emailService: {
    sendVerificationCode: vi.fn(),
  },
}));

vi.mock('@config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@config/env')>();
  return {
    ...actual,
    emailConfig: {
      ...actual.emailConfig,
      verification: {
        secret: 'test-verification-secret',
        codeLength: 6,
        codeExpiresInMinutes: 10,
        resendCooldownSeconds: 60,
        maxCodesPerHour: 5,
        tokenExpiresInMinutes: 5,
      },
    },
  };
});

// Import after mocks
import { emailVerificationService } from '@modules/auth';
import { emailVerificationRepository } from '@modules/auth';
import { emailService } from '@modules/auth';

// ==================== sendCode ====================
// 场景：发送验证码到用户邮箱
// 职责：检查速率限制 → 检查重发冷却 → 作废旧验证码 → 生成新验证码 → 保存到数据库 → 发送邮件
describe('emailVerificationService > sendCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 场景 1：正常发送验证码
  // 应生成验证码、保存到数据库、发送邮件、返回过期时间
  it('should send verification code successfully', async () => {
    vi.mocked(emailVerificationRepository.countRecentCodes).mockResolvedValue(0);
    vi.mocked(emailVerificationRepository.getMostRecentCodeWithAge).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.invalidateAllForEmail).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.create).mockResolvedValue(undefined);
    vi.mocked(emailService.sendVerificationCode).mockResolvedValue(undefined);

    const result = await emailVerificationService.sendCode(mockEmail, 'register', mockIpAddress);

    logTestInfo(
      { email: mockEmail, type: 'register' },
      { hasExpiresAt: true },
      { hasExpiresAt: !!result.expiresAt }
    );

    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(emailVerificationRepository.invalidateAllForEmail).toHaveBeenCalledWith(
      mockEmail.toLowerCase(),
      'register'
    );
    expect(emailVerificationRepository.create).toHaveBeenCalledWith(
      'generated-code-uuid',
      mockEmail.toLowerCase(),
      '123456',
      'register',
      mockIpAddress
    );
    expect(emailService.sendVerificationCode).toHaveBeenCalledWith({
      to: mockEmail.toLowerCase(),
      code: '123456',
      type: 'register',
    });
  });

  // 场景 2：邮箱地址标准化
  // 应将邮箱转为小写并去除空格
  it('should normalize email to lowercase and trim', async () => {
    vi.mocked(emailVerificationRepository.countRecentCodes).mockResolvedValue(0);
    vi.mocked(emailVerificationRepository.getMostRecentCodeWithAge).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.invalidateAllForEmail).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.create).mockResolvedValue(undefined);
    vi.mocked(emailService.sendVerificationCode).mockResolvedValue(undefined);

    await emailVerificationService.sendCode('  TEST@EXAMPLE.COM  ', 'register', mockIpAddress);

    const createCalls = vi.mocked(emailVerificationRepository.create).mock.calls;
    const normalizedEmail = createCalls[0]?.[1];

    logTestInfo(
      { email: '  TEST@EXAMPLE.COM  ' },
      { normalizedEmail: 'test@example.com' },
      { normalizedEmail }
    );

    expect(normalizedEmail).toBe('test@example.com');
  });

  // 场景 3：超过每小时最大验证码数量限制
  // 应抛出 MAX_CODES_EXCEEDED 错误 (429)
  it('should throw MAX_CODES_EXCEEDED when rate limit is reached', async () => {
    vi.mocked(emailVerificationRepository.countRecentCodes).mockResolvedValue(5);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await emailVerificationService.sendCode(mockEmail, 'register', mockIpAddress);
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: EMAIL_ERROR_CODES.MAX_CODES_EXCEEDED, statusCode: 429 };
    logTestInfo({ recentCodes: 5, maxPerHour: 5 }, expected, actual);

    expect(actual?.code).toBe(EMAIL_ERROR_CODES.MAX_CODES_EXCEEDED);
    expect(actual?.statusCode).toBe(429);
  });

  // 场景 4：重发冷却时间内请求
  // 应抛出 RESEND_COOLDOWN 错误 (429) 并包含剩余秒数
  it('should throw RESEND_COOLDOWN when within cooldown period', async () => {
    vi.mocked(emailVerificationRepository.countRecentCodes).mockResolvedValue(1);
    vi.mocked(emailVerificationRepository.getMostRecentCodeWithAge).mockResolvedValue({
      code: mockVerificationCode,
      secondsSinceCreation: 30, // 30 seconds ago (within 60 second cooldown)
    });

    let actual: { code: string; statusCode: number; details?: object } | null = null;
    try {
      await emailVerificationService.sendCode(mockEmail, 'register', mockIpAddress);
    } catch (error) {
      actual = {
        code: (error as AppError).code,
        statusCode: (error as AppError).statusCode,
        details: (error as AppError).details,
      };
    }

    const expected = { code: EMAIL_ERROR_CODES.RESEND_COOLDOWN, statusCode: 429 };
    logTestInfo({ secondsSinceLastCode: 30, cooldownSeconds: 60 }, expected, actual);

    expect(actual?.code).toBe(EMAIL_ERROR_CODES.RESEND_COOLDOWN);
    expect(actual?.statusCode).toBe(429);
    expect(actual?.details).toHaveProperty('retryAfter');
  });

  // 场景 5：冷却时间已过
  // 应允许发送新的验证码
  it('should allow sending code after cooldown period', async () => {
    vi.mocked(emailVerificationRepository.countRecentCodes).mockResolvedValue(1);
    vi.mocked(emailVerificationRepository.getMostRecentCodeWithAge).mockResolvedValue({
      code: mockVerificationCode,
      secondsSinceCreation: 120, // 2 minutes ago (past 60 second cooldown)
    });
    vi.mocked(emailVerificationRepository.invalidateAllForEmail).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.create).mockResolvedValue(undefined);
    vi.mocked(emailService.sendVerificationCode).mockResolvedValue(undefined);

    const result = await emailVerificationService.sendCode(mockEmail, 'register', mockIpAddress);

    logTestInfo(
      { secondsSinceLastCode: 120, cooldownSeconds: 60 },
      { success: true },
      { success: !!result.expiresAt }
    );

    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(emailService.sendVerificationCode).toHaveBeenCalled();
  });

  // 场景 6：邮件发送失败
  // 应抛出 EMAIL_SEND_FAILED 错误 (500)
  it('should throw EMAIL_SEND_FAILED when email sending fails', async () => {
    vi.mocked(emailVerificationRepository.countRecentCodes).mockResolvedValue(0);
    vi.mocked(emailVerificationRepository.getMostRecentCodeWithAge).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.invalidateAllForEmail).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.create).mockResolvedValue(undefined);
    vi.mocked(emailService.sendVerificationCode).mockRejectedValue(new Error('SMTP error'));

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await emailVerificationService.sendCode(mockEmail, 'register', mockIpAddress);
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: EMAIL_ERROR_CODES.EMAIL_SEND_FAILED, statusCode: 500 };
    logTestInfo({ emailSendError: 'SMTP error' }, expected, actual);

    expect(actual?.code).toBe(EMAIL_ERROR_CODES.EMAIL_SEND_FAILED);
    expect(actual?.statusCode).toBe(500);
  });

  // 场景 7：发送前作废旧验证码
  // 应先调用 invalidateAllForEmail
  it('should invalidate old codes before creating new one', async () => {
    vi.mocked(emailVerificationRepository.countRecentCodes).mockResolvedValue(0);
    vi.mocked(emailVerificationRepository.getMostRecentCodeWithAge).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.invalidateAllForEmail).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.create).mockResolvedValue(undefined);
    vi.mocked(emailService.sendVerificationCode).mockResolvedValue(undefined);

    await emailVerificationService.sendCode(mockEmail, 'register', mockIpAddress);

    const invalidateCalls = vi.mocked(emailVerificationRepository.invalidateAllForEmail).mock.calls;
    const createCalls = vi.mocked(emailVerificationRepository.create).mock.calls;

    logTestInfo(
      { email: mockEmail, type: 'register' },
      { invalidateCalled: true, createCalled: true },
      { invalidateCalled: invalidateCalls.length > 0, createCalled: createCalls.length > 0 }
    );

    expect(emailVerificationRepository.invalidateAllForEmail).toHaveBeenCalledWith(
      mockEmail.toLowerCase(),
      'register'
    );
    expect(emailVerificationRepository.invalidateAllForEmail).toHaveBeenCalledBefore(
      vi.mocked(emailVerificationRepository.create)
    );
  });

  // 场景 8：支持不同的验证类型
  // 应正确处理 reset_password 类型
  it('should handle different verification types', async () => {
    vi.mocked(emailVerificationRepository.countRecentCodes).mockResolvedValue(0);
    vi.mocked(emailVerificationRepository.getMostRecentCodeWithAge).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.invalidateAllForEmail).mockResolvedValue(undefined);
    vi.mocked(emailVerificationRepository.create).mockResolvedValue(undefined);
    vi.mocked(emailService.sendVerificationCode).mockResolvedValue(undefined);

    await emailVerificationService.sendCode(mockEmail, 'reset_password', mockIpAddress);

    const createCalls = vi.mocked(emailVerificationRepository.create).mock.calls;
    const type = createCalls[0]?.[3];

    logTestInfo({ type: 'reset_password' }, { storedType: 'reset_password' }, { storedType: type });

    expect(emailVerificationRepository.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      'reset_password',
      expect.any(String)
    );
  });
});

// ==================== verifyCode ====================
// 场景：验证用户输入的验证码
// 职责：查找有效验证码 → 标记为已使用 → 生成验证令牌
describe('emailVerificationService > verifyCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：验证码正确
  // 应标记验证码为已使用并返回验证令牌
  it('should verify code successfully and return verification token', async () => {
    vi.mocked(emailVerificationRepository.findValidCode).mockResolvedValue(mockVerificationCode);
    vi.mocked(emailVerificationRepository.markAsUsed).mockResolvedValue(undefined);

    const result = await emailVerificationService.verifyCode(mockEmail, mockCode, 'register');

    logTestInfo(
      { email: mockEmail, code: mockCode },
      { hasVerificationToken: true },
      { hasVerificationToken: !!result.verificationToken }
    );

    expect(result.verificationToken).toBeDefined();
    expect(typeof result.verificationToken).toBe('string');
    expect(emailVerificationRepository.markAsUsed).toHaveBeenCalledWith(mockVerificationCode.id);
  });

  // 场景 2：验证码无效或已过期
  // 应抛出 CODE_INVALID 错误 (400)
  it('should throw CODE_INVALID when code is invalid or expired', async () => {
    vi.mocked(emailVerificationRepository.findValidCode).mockResolvedValue(undefined);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await emailVerificationService.verifyCode(mockEmail, 'wrong-code', 'register');
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: EMAIL_ERROR_CODES.CODE_INVALID, statusCode: 400 };
    logTestInfo({ code: 'wrong-code' }, expected, actual);

    expect(actual?.code).toBe(EMAIL_ERROR_CODES.CODE_INVALID);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 3：邮箱地址标准化
  // 应将邮箱转为小写并去除空格
  it('should normalize email to lowercase and trim', async () => {
    vi.mocked(emailVerificationRepository.findValidCode).mockResolvedValue(mockVerificationCode);
    vi.mocked(emailVerificationRepository.markAsUsed).mockResolvedValue(undefined);

    await emailVerificationService.verifyCode('  TEST@EXAMPLE.COM  ', mockCode, 'register');

    const findCalls = vi.mocked(emailVerificationRepository.findValidCode).mock.calls;
    const normalizedEmail = findCalls[0]?.[0];

    logTestInfo(
      { email: '  TEST@EXAMPLE.COM  ' },
      { normalizedEmail: 'test@example.com' },
      { normalizedEmail }
    );

    expect(normalizedEmail).toBe('test@example.com');
  });

  // 场景 4：验证令牌包含正确的信息
  // 令牌应包含 email、type 和 purpose
  it('should generate verification token with correct payload', async () => {
    vi.mocked(emailVerificationRepository.findValidCode).mockResolvedValue(mockVerificationCode);
    vi.mocked(emailVerificationRepository.markAsUsed).mockResolvedValue(undefined);

    const result = await emailVerificationService.verifyCode(mockEmail, mockCode, 'register');

    // Decode the token to verify payload
    const decoded = jwt.decode(result.verificationToken) as {
      sub: string;
      type: string;
      purpose: string;
    };

    logTestInfo(
      { email: mockEmail, type: 'register' },
      { sub: mockEmail.toLowerCase(), type: 'register', purpose: 'email_verified' },
      { sub: decoded?.sub, type: decoded?.type, purpose: decoded?.purpose }
    );

    expect(decoded?.sub).toBe(mockEmail.toLowerCase());
    expect(decoded?.type).toBe('register');
    expect(decoded?.purpose).toBe('email_verified');
  });
});

// ==================== verifyToken ====================
// 场景：验证验证令牌的有效性
// 职责：验证 JWT 签名 → 验证令牌类型 → 返回邮箱
describe('emailVerificationService > verifyToken', () => {
  const validPayload = {
    sub: mockEmail.toLowerCase(),
    type: 'register' as const,
    purpose: 'email_verified' as const,
  };

  const signVerificationToken = (
    payload: Record<string, unknown>,
    expiresIn: SignOptions['expiresIn'],
    secret: string = authConfig.jwt.secret
  ) =>
    jwt.sign(payload, secret, {
      expiresIn,
      algorithm: 'HS256',
      issuer: authConfig.jwt.issuer,
      audience: authConfig.jwt.audience,
    });

  // 场景 1：令牌有效
  // 应返回邮箱地址
  it('should verify valid token and return email', () => {
    const token = signVerificationToken(validPayload, '5m');

    const result = emailVerificationService.verifyToken(token, 'register');

    logTestInfo(
      { tokenType: 'register' },
      { email: mockEmail.toLowerCase() },
      { email: result.email }
    );

    expect(result.email).toBe(mockEmail.toLowerCase());
  });

  // 场景 2：令牌已过期
  // 应抛出 VERIFICATION_TOKEN_EXPIRED 错误 (400)
  it('should throw VERIFICATION_TOKEN_EXPIRED when token is expired', () => {
    const token = signVerificationToken(validPayload, '-1s');

    let actual: { code: string; statusCode: number } | null = null;
    try {
      emailVerificationService.verifyToken(token, 'register');
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: EMAIL_ERROR_CODES.VERIFICATION_TOKEN_EXPIRED, statusCode: 400 };
    logTestInfo({ tokenExpired: true }, expected, actual);

    expect(actual?.code).toBe(EMAIL_ERROR_CODES.VERIFICATION_TOKEN_EXPIRED);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 3：令牌签名无效
  // 应抛出 VERIFICATION_TOKEN_INVALID 错误 (400)
  it('should throw VERIFICATION_TOKEN_INVALID when token signature is invalid', () => {
    const token = signVerificationToken(
      validPayload,
      '5m',
      'a-completely-wrong-secret-key-32chars!'
    );

    let actual: { code: string; statusCode: number } | null = null;
    try {
      emailVerificationService.verifyToken(token, 'register');
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID, statusCode: 400 };
    logTestInfo({ tokenSecret: 'wrong-secret' }, expected, actual);

    expect(actual?.code).toBe(EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 4：令牌类型不匹配
  // 应抛出 VERIFICATION_TOKEN_INVALID 错误 (400)
  it('should throw VERIFICATION_TOKEN_INVALID when token type does not match', () => {
    const token = signVerificationToken(validPayload, '5m');

    let actual: { code: string; statusCode: number } | null = null;
    try {
      emailVerificationService.verifyToken(token, 'reset_password'); // Wrong type
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID, statusCode: 400 };
    logTestInfo({ tokenType: 'register', expectedType: 'reset_password' }, expected, actual);

    expect(actual?.code).toBe(EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 5：令牌 purpose 不正确
  // 应抛出 VERIFICATION_TOKEN_INVALID 错误 (400)
  it('should throw VERIFICATION_TOKEN_INVALID when token purpose is wrong', () => {
    const wrongPayload = { ...validPayload, purpose: 'wrong_purpose' };
    const token = signVerificationToken(wrongPayload, '5m');

    let actual: { code: string; statusCode: number } | null = null;
    try {
      emailVerificationService.verifyToken(token, 'register');
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID, statusCode: 400 };
    logTestInfo({ purpose: 'wrong_purpose' }, expected, actual);

    expect(actual?.code).toBe(EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 6：令牌格式错误
  // 应抛出 VERIFICATION_TOKEN_INVALID 错误 (400)
  it('should throw VERIFICATION_TOKEN_INVALID when token is malformed', () => {
    let actual: { code: string; statusCode: number } | null = null;
    try {
      emailVerificationService.verifyToken('malformed-token', 'register');
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID, statusCode: 400 };
    logTestInfo({ token: 'malformed-token' }, expected, actual);

    expect(actual?.code).toBe(EMAIL_ERROR_CODES.VERIFICATION_TOKEN_INVALID);
    expect(actual?.statusCode).toBe(400);
  });
});
