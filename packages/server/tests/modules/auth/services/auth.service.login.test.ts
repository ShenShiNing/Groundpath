import { describe, expect, it, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { LoginRequest } from '@knowledge-agent/shared/types';
import { AppError } from '@shared/errors';
import { mockUser, mockTokenPair, logTestInfo } from '@tests/__mocks__/auth.mocks';

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

vi.mock('@shared/utils/jwt.utils', () => ({
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

vi.mock('@shared/middleware/rate-limit.middleware', () => ({
  checkAccountRateLimit: vi.fn(() => ({ allowed: true })),
  resetAccountRateLimit: vi.fn(),
  // no-op placeholders to satisfy barrel exports used by routes
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
import { loginLogRepository } from '@modules/auth';
import { tokenService } from '@modules/auth';
import {
  checkAccountRateLimit,
  resetAccountRateLimit,
} from '@shared/middleware/rate-limit.middleware';

// ==================== login ====================
// 场景：用户使用邮箱密码登录
// 职责：限流检查 → 用户查找 → 密码验证 → 状态检查 → 记录日志 → 生成令牌
describe('authService > login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validCredentials: LoginRequest = {
    email: 'test@example.com',
    password: 'password123',
  };
  const ipAddress = '192.168.1.1';
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0';

  // 场景 1：正常登录 — 凭证正确、用户状态正常
  // 应返回用户公开信息和令牌对
  it('should login successfully with valid credentials', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(loginLogRepository.recordSuccess).mockResolvedValue(undefined);
    vi.mocked(userRepository.updateLastLogin).mockResolvedValue(undefined);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    const result = await authService.login(validCredentials, ipAddress, userAgent);

    logTestInfo(
      { email: validCredentials.email, password: '***' },
      { hasTokens: true, userId: 'user-123' },
      { hasTokens: !!result.tokens, userId: result.user.id }
    );

    expect(result.tokens).toEqual(mockTokenPair);
    expect(result.user).toMatchObject({
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
    });
  });

  // 场景 2：验证账户级别限流检查
  // 确保在任何数据库操作之前先进行限流检查
  it('should check rate limit before processing login', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, userAgent);

    const calledWith = vi.mocked(checkAccountRateLimit).mock.calls[0]?.[0];
    logTestInfo(
      { email: validCredentials.email },
      { rateLimitCheckedFor: 'test@example.com' },
      { rateLimitCheckedFor: calledWith }
    );

    expect(checkAccountRateLimit).toHaveBeenCalledWith('test@example.com');
  });

  // 场景 3：登录尝试次数超限
  // 账户级别限流触发（如 10 次/小时）→ 抛出 RATE_LIMITED (429)
  it('should throw RATE_LIMITED when rate limit exceeded', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({
      allowed: false,
      retryAfter: 300,
    });

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await authService.login(validCredentials, ipAddress, userAgent);
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: AUTH_ERROR_CODES.RATE_LIMITED, statusCode: 429 };
    logTestInfo(
      { email: validCredentials.email, rateLimitAllowed: false, retryAfter: 300 },
      expected,
      actual
    );

    expect(actual?.code).toBe(AUTH_ERROR_CODES.RATE_LIMITED);
    expect(actual?.statusCode).toBe(429);
  });

  // 场景 3.1：限流 — retryAfter 为 undefined（覆盖 ?? 0 分支）
  // 测试空值合并运算符的 fallback 分支
  it('should handle rate limit with undefined retryAfter', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({
      allowed: false,
      retryAfter: undefined,
    });

    let actual: { code: string; message: string } | null = null;
    try {
      await authService.login(validCredentials, ipAddress, userAgent);
    } catch (error) {
      actual = { code: (error as AppError).code, message: (error as AppError).message };
    }

    const expected = { code: AUTH_ERROR_CODES.RATE_LIMITED, messageContains: '0 minute' };
    logTestInfo({ retryAfter: undefined }, expected, {
      code: actual?.code,
      message: actual?.message,
    });

    expect(actual?.code).toBe(AUTH_ERROR_CODES.RATE_LIMITED);
    // retryAfter undefined → 0 → Math.ceil(0/60) = 0 → "0 minute" (单数)
    expect(actual?.message).toContain('0 minute');
  });

  // 场景 3.2：限流 — retryAfter <= 60 秒（覆盖单数 minute 分支）
  // 测试三元表达式的 false 分支：minutes <= 1 时不加 's'
  it('should handle rate limit with retryAfter <= 60 seconds (singular minute)', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({
      allowed: false,
      retryAfter: 30, // 30 秒 → Math.ceil(30/60) = 1 分钟
    });

    let actual: { code: string; message: string } | null = null;
    try {
      await authService.login(validCredentials, ipAddress, userAgent);
    } catch (error) {
      actual = { code: (error as AppError).code, message: (error as AppError).message };
    }

    const expected = { code: AUTH_ERROR_CODES.RATE_LIMITED, messagePattern: '1 minute.' };
    logTestInfo({ retryAfter: 30 }, expected, { code: actual?.code, message: actual?.message });

    expect(actual?.code).toBe(AUTH_ERROR_CODES.RATE_LIMITED);
    // 1 分钟时应该是 "1 minute." 而不是 "1 minutes."
    expect(actual?.message).toMatch(/1 minute\./);
    expect(actual?.message).not.toContain('minutes');
  });

  // 场景 4：用户不存在
  // 邮箱在数据库中查不到 → 记录失败日志 → 抛出 INVALID_CREDENTIALS
  // 注意：不应泄露"用户不存在"的信息，统一返回"凭证无效"
  it('should throw INVALID_CREDENTIALS when user not found', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(undefined);

    let actual: { code: string; loggedFailure: boolean } | null = null;
    try {
      await authService.login(validCredentials, ipAddress, userAgent);
    } catch (error) {
      actual = {
        code: (error as AppError).code,
        loggedFailure: vi.mocked(loginLogRepository.recordFailure).mock.calls.length > 0,
      };
    }

    const expected = { code: AUTH_ERROR_CODES.INVALID_CREDENTIALS, loggedFailure: true };
    logTestInfo({ email: validCredentials.email, userFound: false }, expected, actual);

    expect(actual?.code).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
    expect(loginLogRepository.recordFailure).toHaveBeenCalledWith(
      'test@example.com',
      'password',
      'Invalid credentials',
      ipAddress,
      userAgent,
      undefined,
      expect.objectContaining({
        deviceInfo: expect.any(Object),
        geoInfo: expect.any(Object),
      })
    );
  });

  // 场景 5：OAuth 用户尝试密码登录
  // 用户存在但 password 字段为 null（第三方登录注册）→ 抛出 INVALID_CREDENTIALS
  it('should throw INVALID_CREDENTIALS when user has no password (OAuth user)', async () => {
    const oauthUser = { ...mockUser, password: null };
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(oauthUser);

    let actual: { code: string } | null = null;
    try {
      await authService.login(validCredentials, ipAddress, userAgent);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    const expected = { code: AUTH_ERROR_CODES.INVALID_CREDENTIALS };
    logTestInfo({ email: validCredentials.email, userHasPassword: false }, expected, actual);

    expect(actual?.code).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
  });

  // 场景 6：密码错误
  // 用户存在但 bcrypt.compare 返回 false → 记录失败日志（含 userId） → 抛出 INVALID_CREDENTIALS
  it('should throw INVALID_CREDENTIALS when password is wrong', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    let actual: { code: string } | null = null;
    try {
      await authService.login(validCredentials, ipAddress, userAgent);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    const expected = { code: AUTH_ERROR_CODES.INVALID_CREDENTIALS };
    logTestInfo({ email: validCredentials.email, passwordCorrect: false }, expected, actual);

    expect(actual?.code).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
    expect(loginLogRepository.recordFailure).toHaveBeenCalledWith(
      'test@example.com',
      'password',
      'Invalid password',
      ipAddress,
      userAgent,
      'user-123',
      expect.objectContaining({
        deviceInfo: expect.any(Object),
        geoInfo: expect.any(Object),
      })
    );
  });

  // 场景 7：用户已被封禁
  // 凭证正确但用户状态为 banned → 记录失败日志 → 抛出 USER_BANNED (403)
  it('should throw USER_BANNED when user is banned', async () => {
    const bannedUser = { ...mockUser, status: 'banned' as const };
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(bannedUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await authService.login(validCredentials, ipAddress, userAgent);
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: AUTH_ERROR_CODES.USER_BANNED, statusCode: 403 };
    logTestInfo({ email: validCredentials.email, userStatus: 'banned' }, expected, actual);

    expect(actual?.code).toBe(AUTH_ERROR_CODES.USER_BANNED);
    expect(actual?.statusCode).toBe(403);
  });

  // 场景 8：成功登录后记录日志
  // 验证 loginLogRepository.recordSuccess 被正确调用
  it('should record successful login', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, userAgent);

    const calledWith = vi.mocked(loginLogRepository.recordSuccess).mock.calls[0];
    logTestInfo(
      { userId: 'user-123', email: validCredentials.email },
      {
        loggedWith: ['user-123', 'test@example.com', 'password', ipAddress, userAgent, 'enhanced'],
      },
      { loggedWith: calledWith }
    );

    expect(loginLogRepository.recordSuccess).toHaveBeenCalledWith(
      'user-123',
      'test@example.com',
      'password',
      ipAddress,
      userAgent,
      expect.objectContaining({
        deviceInfo: expect.any(Object),
        geoInfo: expect.any(Object),
      })
    );
  });

  // 场景 9：成功登录后重置限流计数器
  // 防止之前的失败尝试影响后续正常使用
  it('should reset rate limit on successful login', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, userAgent);

    const calledWith = vi.mocked(resetAccountRateLimit).mock.calls[0]?.[0];
    logTestInfo(
      { email: validCredentials.email },
      { resetRateLimitFor: 'test@example.com' },
      { resetRateLimitFor: calledWith }
    );

    expect(resetAccountRateLimit).toHaveBeenCalledWith('test@example.com');
  });

  // 场景 10：更新用户最后登录信息
  // 记录登录时间和 IP 地址
  it('should update last login info', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, userAgent);

    const calledWith = vi.mocked(userRepository.updateLastLogin).mock.calls[0];
    logTestInfo(
      { userId: 'user-123', ip: ipAddress },
      { updateLastLoginWith: ['user-123', ipAddress] },
      { updateLastLoginWith: calledWith }
    );

    expect(userRepository.updateLastLogin).toHaveBeenCalledWith('user-123', ipAddress);
  });

  // 场景 11：从 User-Agent 解析设备信息
  // 测试 parseDeviceInfo 函数正确识别 Windows + Chrome + Desktop
  it('should parse device info from user agent', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, userAgent);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    const expected = { deviceType: 'Desktop', os: 'Windows', browser: 'Chrome' };
    logTestInfo({ userAgent }, expected, {
      deviceType: calledDeviceInfo?.deviceType,
      os: calledDeviceInfo?.os,
      browser: calledDeviceInfo?.browser,
    });

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      expect.objectContaining({
        userAgent,
        deviceType: 'Desktop',
        os: 'Windows',
        browser: 'Chrome',
      })
    );
  });

  // 场景 12：客户端提供了设备信息，优先使用客户端提供的
  // 某些客户端（如移动 App）可能直接传递 deviceInfo
  it('should use provided deviceInfo if available', async () => {
    const credentialsWithDevice: LoginRequest = {
      ...validCredentials,
      deviceInfo: {
        userAgent: 'Custom App',
        deviceType: 'mobile',
        os: 'iOS',
      },
    };
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(credentialsWithDevice, ipAddress, userAgent);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    logTestInfo(
      { providedDeviceInfo: credentialsWithDevice.deviceInfo },
      { usedDeviceInfo: credentialsWithDevice.deviceInfo },
      { usedDeviceInfo: calledDeviceInfo }
    );

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      credentialsWithDevice.deviceInfo
    );
  });

  // 场景 13：IP 地址为 null（如通过负载均衡器但未配置 X-Forwarded-For）
  // 应正常处理，IP 字段记录为 null
  it('should handle null IP address', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, null, userAgent);

    const calledIp = vi.mocked(userRepository.updateLastLogin).mock.calls[0]?.[1];
    logTestInfo({ ip: null }, { updateLastLoginIp: null }, { updateLastLoginIp: calledIp });

    expect(userRepository.updateLastLogin).toHaveBeenCalledWith('user-123', null);
  });

  // 场景 14：User-Agent 为 null（某些 API 客户端可能不发送）
  // 应正常处理，deviceInfo 为 null
  it('should handle null user agent', async () => {
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, null);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    logTestInfo({ userAgent: null }, { deviceInfo: null }, { deviceInfo: calledDeviceInfo });

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      null
    );
  });

  // 场景 15：检测移动设备
  // 测试 parseDeviceInfo 函数正确识别 Mobile + Safari
  it('should detect mobile device from user agent', async () => {
    const mobileUserAgent = 'Mozilla/5.0 Mobile Safari/605.1';
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, mobileUserAgent);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    const expected = { deviceType: 'Mobile', browser: 'Safari' };
    logTestInfo({ userAgent: mobileUserAgent }, expected, {
      deviceType: calledDeviceInfo?.deviceType,
      browser: calledDeviceInfo?.browser,
    });

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      expect.objectContaining({
        deviceType: 'Mobile',
        browser: 'Safari',
      })
    );
  });

  // 场景 16：检测平板设备
  // 测试 parseDeviceInfo 函数正确识别 tablet
  it('should detect tablet device from user agent', async () => {
    const tabletUserAgent = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Tablet Safari/605.1';
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, tabletUserAgent);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    logTestInfo(
      { userAgent: tabletUserAgent },
      { deviceType: 'Tablet' },
      { deviceType: calledDeviceInfo?.deviceType }
    );

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      expect.objectContaining({
        deviceType: 'Tablet',
      })
    );
  });

  // 场景 17：检测 macOS 系统
  // 测试 parseDeviceInfo 函数正确识别 macOS
  it('should detect macOS from user agent', async () => {
    const macUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1';
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, macUserAgent);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    logTestInfo(
      { userAgent: macUserAgent },
      { os: 'macOS', browser: 'Safari' },
      { os: calledDeviceInfo?.os, browser: calledDeviceInfo?.browser }
    );

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      expect.objectContaining({
        os: 'macOS',
        browser: 'Safari',
      })
    );
  });

  // 场景 18：检测 Linux 系统
  // 测试 parseDeviceInfo 函数正确识别 Linux（非 Android）
  it('should detect Linux from user agent', async () => {
    const linuxUserAgent = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0';
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, linuxUserAgent);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    logTestInfo(
      { userAgent: linuxUserAgent },
      { os: 'Linux', browser: 'Firefox' },
      { os: calledDeviceInfo?.os, browser: calledDeviceInfo?.browser }
    );

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      expect.objectContaining({
        os: 'Linux',
        browser: 'Firefox',
      })
    );
  });

  // 场景 19：检测 Android 系统
  it('should detect Android from user agent (without Linux keyword)', async () => {
    const androidUserAgent = 'Mozilla/5.0 (Android 14; Mobile) Chrome/120.0';
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, androidUserAgent);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    logTestInfo(
      { userAgent: androidUserAgent },
      { os: 'Android', deviceType: 'Mobile' },
      { os: calledDeviceInfo?.os, deviceType: calledDeviceInfo?.deviceType }
    );

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      expect.objectContaining({
        os: 'Android',
        deviceType: 'Mobile',
      })
    );
  });

  // 场景 20：检测 iOS 系统
  it('should detect iOS from user agent (without Mac OS keyword)', async () => {
    const iosUserAgent = 'Mozilla/5.0 (iPhone) Mobile Safari/605.1';
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, iosUserAgent);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    logTestInfo(
      { userAgent: iosUserAgent },
      { os: 'iOS', deviceType: 'Mobile' },
      { os: calledDeviceInfo?.os, deviceType: calledDeviceInfo?.deviceType }
    );

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      expect.objectContaining({
        os: 'iOS',
        deviceType: 'Mobile',
      })
    );
  });

  // 场景 21：检测 Edge 浏览器
  it('should detect Edge browser from user agent', async () => {
    const edgeUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Edg/120.0';
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, edgeUserAgent);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    logTestInfo(
      { userAgent: edgeUserAgent },
      { browser: 'Edge', os: 'Windows' },
      { browser: calledDeviceInfo?.browser, os: calledDeviceInfo?.os }
    );

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      expect.objectContaining({
        browser: 'Edge',
        os: 'Windows',
      })
    );
  });

  // 场景 22：未知操作系统和浏览器
  it('should handle unknown OS and browser in user agent', async () => {
    const unknownUserAgent = 'CustomBot/1.0';
    vi.mocked(checkAccountRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(userRepository.findByEmail).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(tokenService.generateTokenPair).mockResolvedValue(mockTokenPair);

    await authService.login(validCredentials, ipAddress, unknownUserAgent);

    const calledDeviceInfo = vi.mocked(tokenService.generateTokenPair).mock.calls[0]?.[2];
    logTestInfo(
      { userAgent: unknownUserAgent },
      { deviceType: 'Desktop', os: undefined, browser: undefined },
      {
        deviceType: calledDeviceInfo?.deviceType,
        os: calledDeviceInfo?.os,
        browser: calledDeviceInfo?.browser,
      }
    );

    expect(tokenService.generateTokenPair).toHaveBeenCalledWith(
      expect.any(Object),
      ipAddress,
      expect.objectContaining({
        userAgent: unknownUserAgent,
        deviceType: 'Desktop',
      })
    );
    expect(calledDeviceInfo?.os).toBeUndefined();
    expect(calledDeviceInfo?.browser).toBeUndefined();
  });
});
