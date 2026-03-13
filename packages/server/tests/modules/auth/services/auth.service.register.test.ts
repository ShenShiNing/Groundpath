import { describe, expect, it, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { RegisterRequest } from '@knowledge-agent/shared/types';
import { AppError } from '@core/errors';
import { mockTokenPair, mockCreatedUser, logTestInfo } from '@tests/__mocks__/auth.mocks';

// ==================== Mocks ====================

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid-123'),
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock('@core/utils/jwt.utils', () => ({
  verifyRefreshToken: vi.fn(),
}));

vi.mock('@modules/user/repositories/user.repository', () => ({
  userRepository: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    updateLastLogin: vi.fn(),
    existsByEmail: vi.fn(),
    existsByUsername: vi.fn(),
    create: vi.fn(),
    updatePassword: vi.fn(),
  },
}));

vi.mock('@modules/auth/repositories/login-log.repository', () => ({
  loginLogRepository: {
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  },
}));

vi.mock('@modules/auth/repositories/refresh-token.repository', () => ({
  refreshTokenRepository: {
    revokeAllForUser: vi.fn(),
  },
}));

vi.mock('@modules/auth/services/token.service', () => ({
  tokenService: {
    generateTokenPair: vi.fn(),
    refreshTokens: vi.fn(),
    revokeToken: vi.fn(),
    revokeAllUserTokens: vi.fn(),
    getUserSessions: vi.fn(),
  },
}));

vi.mock('@core/middleware/rate-limit.middleware', () => ({
  checkAccountRateLimit: vi.fn(() => ({ allowed: true })),
  resetAccountRateLimit: vi.fn(),
  loginRateLimiter: vi.fn((_req, _res, next) => next()),
  registerRateLimiter: vi.fn((_req, _res, next) => next()),
  refreshRateLimiter: vi.fn((_req, _res, next) => next()),
  generalRateLimiter: vi.fn((_req, _res, next) => next()),
  passwordResetRateLimiter: vi.fn((_req, _res, next) => next()),
  emailSendRateLimiter: vi.fn((_req, _res, next) => next()),
  emailVerifyRateLimiter: vi.fn((_req, _res, next) => next()),
}));

// Import after mocks
import { authService } from '@modules/auth';
import { userRepository } from '@modules/user';
import { loginLogRepository, tokenService } from '@modules/auth';

// ==================== register ====================
// 场景：新用户注册账户
// 职责：检查邮箱唯一性 → 检查用户名唯一性 → 哈希密码 → 创建用户 → 记录日志 → 生成令牌
describe('authService > register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validRegisterData: RegisterRequest = {
    username: 'newuser',
    email: 'newuser@example.com',
    password: 'Password123',
    confirmPassword: 'Password123',
  };
  const ipAddress = '192.168.1.1';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0';

  // 场景 1：正常注册 — 邮箱和用户名都可用
  // 应创建用户、记录日志、返回用户信息和令牌
  it('should register successfully with valid data', async () => {
    vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
    vi.mocked(userRepository.existsByUsername).mockResolvedValue(false);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$hashedpassword' as never);
    vi.mocked(userRepository.create).mockResolvedValue(mockCreatedUser);
    vi.mocked(loginLogRepository.recordSuccess).mockResolvedValue(undefined);
    vi.mocked(userRepository.updateLastLogin).mockResolvedValue(undefined);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    const result = await authService.register(validRegisterData, ipAddress, userAgent);

    logTestInfo(
      { email: validRegisterData.email, username: validRegisterData.username },
      { hasTokens: true, userId: 'generated-uuid-123' },
      { hasTokens: !!result.tokens, userId: result.user.id }
    );

    expect(result.tokens).toEqual(mockTokenPair);
    expect(result.user).toMatchObject({
      id: 'generated-uuid-123',
      email: 'newuser@example.com',
      username: 'newuser',
      status: 'active',
    });
  });

  // 场景 2：检查密码是否正确哈希
  // 应使用 bcrypt 对密码进行哈希处理
  it('should hash password before creating user', async () => {
    vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
    vi.mocked(userRepository.existsByUsername).mockResolvedValue(false);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$hashedpassword' as never);
    vi.mocked(userRepository.create).mockResolvedValue(mockCreatedUser);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.register(validRegisterData, ipAddress, userAgent);

    const hashCalls = vi.mocked(bcrypt.hash).mock.calls;
    logTestInfo(
      { password: '***' },
      { hashCalledWith: ['Password123', 12] },
      { hashCalledWith: hashCalls[0] }
    );

    expect(bcrypt.hash).toHaveBeenCalledWith('Password123', 12);
  });

  // 场景 3：邮箱已存在
  // 应抛出 EMAIL_ALREADY_EXISTS 错误 (400)
  it('should throw EMAIL_ALREADY_EXISTS when email is taken', async () => {
    vi.mocked(userRepository.existsByEmail).mockResolvedValue(true);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await authService.register(validRegisterData, ipAddress, userAgent);
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS, statusCode: 400 };
    logTestInfo({ email: validRegisterData.email, emailExists: true }, expected, actual);

    expect(actual?.code).toBe(AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 4：用户名已存在
  // 应抛出 USERNAME_ALREADY_EXISTS 错误 (400)
  it('should throw USERNAME_ALREADY_EXISTS when username is taken', async () => {
    vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
    vi.mocked(userRepository.existsByUsername).mockResolvedValue(true);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await authService.register(validRegisterData, ipAddress, userAgent);
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: AUTH_ERROR_CODES.USERNAME_ALREADY_EXISTS, statusCode: 400 };
    logTestInfo({ username: validRegisterData.username, usernameExists: true }, expected, actual);

    expect(actual?.code).toBe(AUTH_ERROR_CODES.USERNAME_ALREADY_EXISTS);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 5：验证创建用户时传入正确的参数
  // 应包含 id、username、email、hashedPassword、status='active'
  it('should create user with correct data', async () => {
    vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
    vi.mocked(userRepository.existsByUsername).mockResolvedValue(false);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$hashedpassword' as never);
    vi.mocked(userRepository.create).mockResolvedValue(mockCreatedUser);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.register(validRegisterData, ipAddress, userAgent);

    const createCalls = vi.mocked(userRepository.create).mock.calls;
    const createData = createCalls[0]?.[0];
    logTestInfo(
      { email: validRegisterData.email, username: validRegisterData.username },
      { id: 'generated-uuid-123', status: 'active', hasHashedPassword: true },
      { id: createData?.id, status: createData?.status, hasHashedPassword: !!createData?.password }
    );

    expect(userRepository.create).toHaveBeenCalledWith({
      id: 'generated-uuid-123',
      username: 'newuser',
      email: 'newuser@example.com',
      password: '$2a$12$hashedpassword',
      status: 'active',
    });
  });

  // 场景 6：验证登录日志被记录
  // 注册成功后应记录一条成功的登录日志
  it('should record login log on successful registration', async () => {
    vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
    vi.mocked(userRepository.existsByUsername).mockResolvedValue(false);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$hashedpassword' as never);
    vi.mocked(userRepository.create).mockResolvedValue(mockCreatedUser);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.register(validRegisterData, ipAddress, userAgent);

    const logCalls = vi.mocked(loginLogRepository.recordSuccess).mock.calls;
    logTestInfo(
      { userId: 'generated-uuid-123', email: validRegisterData.email },
      { logRecorded: true },
      { logRecorded: logCalls.length > 0 }
    );

    expect(loginLogRepository.recordSuccess).toHaveBeenCalledWith(
      'generated-uuid-123',
      'newuser@example.com',
      'password',
      ipAddress,
      userAgent,
      expect.objectContaining({
        deviceInfo: expect.any(Object),
        geoInfo: expect.any(Object),
      })
    );
  });

  // 场景 7：带 deviceInfo 的注册
  // 应将 deviceInfo 传递给 tokenService
  it('should pass deviceInfo to token service when provided', async () => {
    const registerWithDevice: RegisterRequest = {
      ...validRegisterData,
      deviceInfo: {
        userAgent: 'Custom Agent',
        deviceType: 'mobile',
        os: 'iOS',
        browser: 'Safari',
      },
    };
    vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
    vi.mocked(userRepository.existsByUsername).mockResolvedValue(false);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$hashedpassword' as never);
    vi.mocked(userRepository.create).mockResolvedValue(mockCreatedUser);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.register(registerWithDevice, ipAddress, userAgent);

    const tokenCalls = vi.mocked(tokenService.generateTokenPair).mock.calls;
    const deviceInfo = tokenCalls[0]?.[2];
    logTestInfo(
      { hasDeviceInfo: true },
      { deviceType: 'mobile', os: 'iOS' },
      { deviceType: deviceInfo?.deviceType, os: deviceInfo?.os }
    );

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      registerWithDevice.deviceInfo
    );
  });

  // 场景 8：不带 deviceInfo 的注册
  // 应从 userAgent 解析设备信息
  it('should parse deviceInfo from userAgent when not provided', async () => {
    vi.mocked(userRepository.existsByEmail).mockResolvedValue(false);
    vi.mocked(userRepository.existsByUsername).mockResolvedValue(false);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$hashedpassword' as never);
    vi.mocked(userRepository.create).mockResolvedValue(mockCreatedUser);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.register(validRegisterData, ipAddress, userAgent);

    const tokenCalls = vi.mocked(tokenService.generateTokenPair).mock.calls;
    const deviceInfo = tokenCalls[0]?.[2];
    logTestInfo(
      { userAgent, deviceInfoProvided: false },
      { hasParsedDeviceInfo: true, os: 'Windows', browser: 'Chrome' },
      { hasParsedDeviceInfo: !!deviceInfo, os: deviceInfo?.os, browser: deviceInfo?.browser }
    );

    expect(deviceInfo).toMatchObject({
      os: 'Windows',
      browser: 'Chrome',
      deviceType: 'Desktop',
    });
  });
});
