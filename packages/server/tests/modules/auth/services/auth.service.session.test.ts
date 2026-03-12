import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@shared/errors';
import { mockUser, mockTokenPair, mockSessions, logTestInfo } from '@tests/__mocks__/auth.mocks';

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

vi.mock('@modules/auth/repositories/user-token-state.repository', () => ({
  userTokenStateRepository: {
    bumpTokenValidAfter: vi.fn(),
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
  loginRateLimiter: vi.fn((_req, _res, next) => next()),
  registerRateLimiter: vi.fn((_req, _res, next) => next()),
  refreshRateLimiter: vi.fn((_req, _res, next) => next()),
  generalRateLimiter: vi.fn((_req, _res, next) => next()),
  passwordResetRateLimiter: vi.fn((_req, _res, next) => next()),
  emailSendRateLimiter: vi.fn((_req, _res, next) => next()),
  emailVerifyRateLimiter: vi.fn((_req, _res, next) => next()),
}));

// Import after mocks
import { authService, tokenService, sessionService } from '@modules/auth';
import { userRepository } from '@modules/user';

// ==================== Session Management ====================
describe('authService > session management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== refresh ====================
  // 场景：使用 refresh token 获取新的令牌对
  // 职责：委托 tokenService.refreshTokens → 获取用户信息 → 返回响应
  describe('refresh', () => {
    const refreshToken = 'valid-refresh-token';
    const ipAddress = '192.168.1.1';
    const userAgent = 'Mozilla/5.0';

    // 场景 1：正常刷新
    // tokenService 成功刷新 → 查询用户信息 → 返回用户和新令牌
    it('should refresh tokens successfully', async () => {
      vi.mocked(tokenService.refreshTokens).mockResolvedValue({
        tokens: mockTokenPair,
        userId: 'user-123',
      });
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);

      const result = await authService.refresh(refreshToken, ipAddress, userAgent);

      logTestInfo(
        { refreshToken: '***' },
        { hasTokens: true, userId: 'user-123' },
        { hasTokens: !!result.tokens, userId: result.user.id }
      );

      expect(result.tokens).toEqual(mockTokenPair);
      expect(result.user).toMatchObject({
        id: 'user-123',
        email: 'test@example.com',
      });
    });

    // 场景 2：验证委托调用
    // 确保 tokenService.refreshTokens 被正确调用
    it('should call tokenService.refreshTokens', async () => {
      vi.mocked(tokenService.refreshTokens).mockResolvedValue({
        tokens: mockTokenPair,
        userId: 'user-123',
      });
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);

      await authService.refresh(refreshToken, ipAddress, userAgent);

      const calledWith = vi.mocked(tokenService.refreshTokens).mock.calls[0];
      logTestInfo(
        { refreshToken: '***', ip: ipAddress },
        { calledWith: [refreshToken, ipAddress, 'deviceInfo'] },
        { calledWith: [calledWith?.[0], calledWith?.[1], 'deviceInfo'] }
      );

      expect(tokenService.refreshTokens).toHaveBeenCalledWith(
        refreshToken,
        ipAddress,
        expect.any(Object)
      );
    });

    // 场景 3：用户不存在（可能已被删除）
    // token 刷新成功但用户已不存在 → 抛出 TOKEN_INVALID
    it('should throw TOKEN_INVALID if user not found', async () => {
      vi.mocked(tokenService.refreshTokens).mockResolvedValue({
        tokens: mockTokenPair,
        userId: 'deleted-user',
      });
      vi.mocked(userRepository.findById).mockResolvedValue(undefined);

      let actual: { code: string } | null = null;
      try {
        await authService.refresh(refreshToken, ipAddress, userAgent);
      } catch (error) {
        actual = { code: (error as AppError).code };
      }

      const expected = { code: AUTH_ERROR_CODES.TOKEN_INVALID };
      logTestInfo({ userId: 'deleted-user', userFound: false }, expected, actual);

      expect(actual?.code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
    });
  });

  // ==================== logout ====================
  // 场景：单设备登出 — 吊销当前设备的 refresh token
  describe('logout', () => {
    // 场景 1：正常登出
    // 委托 tokenService.revokeToken 吊销指定 token
    it('should revoke the specified token', async () => {
      vi.mocked(tokenService.revokeToken).mockResolvedValue(undefined);

      await sessionService.logout('token-123');

      const calledWith = vi.mocked(tokenService.revokeToken).mock.calls[0]?.[0];
      logTestInfo(
        { tokenId: 'token-123' },
        { revokedTokenId: 'token-123' },
        { revokedTokenId: calledWith }
      );

      expect(tokenService.revokeToken).toHaveBeenCalledWith('token-123');
    });
  });

  // ==================== logoutAll ====================
  // 场景：全设备登出 — 吊销用户所有设备的 refresh token
  describe('logoutAll', () => {
    // 场景 1：正常全设备登出
    // 委托 tokenService.revokeAllUserTokens → 返回吊销的 token 数量
    it('should revoke all tokens for user', async () => {
      vi.mocked(tokenService.revokeAllUserTokens).mockResolvedValue(5);

      const result = await sessionService.logoutAll('user-123');

      logTestInfo({ userId: 'user-123' }, { revokedCount: 5 }, { revokedCount: result });

      expect(result).toBe(5);
      expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith('user-123');
    });
  });

  // ==================== getCurrentUser ====================
  // 场景：获取当前登录用户的公开信息
  describe('getCurrentUser', () => {
    // 场景 1：正常获取用户信息
    // 返回用户公开信息（不含密码等敏感字段）
    it('should return user public info without sensitive fields', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(mockUser);

      const result = await authService.getCurrentUser('user-123');

      logTestInfo(
        { userId: 'user-123' },
        { hasId: true, hasEmail: true, hasPassword: false },
        { hasId: !!result.id, hasEmail: !!result.email, hasPassword: 'password' in result }
      );

      expect(result).toMatchObject({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        status: 'active',
        emailVerified: true,
      });
      // 验证不包含敏感字段
      expect(result).not.toHaveProperty('password');
    });

    // 场景 2：用户不存在
    // userId 无效或用户已删除 → 抛出 TOKEN_INVALID
    it('should throw TOKEN_INVALID if user not found', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(undefined);

      let actual: { code: string } | null = null;
      try {
        await authService.getCurrentUser('non-existent');
      } catch (error) {
        actual = { code: (error as AppError).code };
      }

      const expected = { code: AUTH_ERROR_CODES.TOKEN_INVALID };
      logTestInfo({ userId: 'non-existent', userFound: false }, expected, actual);

      expect(actual?.code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
    });
  });

  // ==================== getSessions ====================
  // 场景：获取用户的所有活跃会话列表
  describe('getSessions', () => {
    // 场景 1：正常获取会话列表
    // 委托 tokenService.getUserSessions → 返回会话列表
    it('should return user sessions', async () => {
      vi.mocked(tokenService.getUserSessions).mockResolvedValue(mockSessions);

      const result = await sessionService.getSessions('user-123', 'session-1');

      logTestInfo(
        { userId: 'user-123', currentTokenId: 'session-1' },
        { sessionCount: 2 },
        { sessionCount: result.length }
      );

      expect(result).toEqual(mockSessions);
      expect(tokenService.getUserSessions).toHaveBeenCalledWith('user-123', 'session-1');
    });

    // 场景 2：不传 currentTokenId
    // 调用时 currentTokenId 为 undefined
    it('should work without currentTokenId', async () => {
      vi.mocked(tokenService.getUserSessions).mockResolvedValue(mockSessions);

      await sessionService.getSessions('user-123');

      const calledWith = vi.mocked(tokenService.getUserSessions).mock.calls[0];
      logTestInfo(
        { userId: 'user-123', currentTokenId: undefined },
        { calledWith: ['user-123', undefined] },
        { calledWith }
      );

      expect(tokenService.getUserSessions).toHaveBeenCalledWith('user-123', undefined);
    });
  });

  // ==================== revokeSession ====================
  // 场景：吊销指定会话（用于"踢出其他设备"功能）
  // 职责：验证会话归属 → 吊销 token
  describe('revokeSession', () => {
    const userSessions = [
      {
        id: 'session-1',
        deviceInfo: null,
        ipAddress: '192.168.1.1',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isCurrent: false,
      },
      {
        id: 'session-2',
        deviceInfo: null,
        ipAddress: '10.0.0.1',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        isCurrent: false,
      },
    ];

    // 场景 1：正常吊销会话
    // 会话属于该用户 → 吊销成功
    it('should revoke session if it belongs to user', async () => {
      vi.mocked(tokenService.getUserSessions).mockResolvedValue(userSessions);
      vi.mocked(tokenService.revokeToken).mockResolvedValue(undefined);

      await sessionService.revokeSession('user-123', 'session-1');

      const calledWith = vi.mocked(tokenService.revokeToken).mock.calls[0]?.[0];
      logTestInfo(
        { userId: 'user-123', sessionId: 'session-1' },
        { revokedSessionId: 'session-1' },
        { revokedSessionId: calledWith }
      );

      expect(tokenService.revokeToken).toHaveBeenCalledWith('session-1');
    });

    // 场景 2：会话不存在
    // 指定的 sessionId 不属于该用户 → 抛出 SESSION_NOT_FOUND (404)
    it('should throw SESSION_NOT_FOUND if session does not exist', async () => {
      vi.mocked(tokenService.getUserSessions).mockResolvedValue(userSessions);

      let actual: { code: string; statusCode: number } | null = null;
      try {
        await sessionService.revokeSession('user-123', 'non-existent-session');
      } catch (error) {
        actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
      }

      const expected = { code: AUTH_ERROR_CODES.SESSION_NOT_FOUND, statusCode: 404 };
      logTestInfo(
        {
          userId: 'user-123',
          sessionId: 'non-existent-session',
          userSessions: ['session-1', 'session-2'],
        },
        expected,
        actual
      );

      expect(actual?.code).toBe(AUTH_ERROR_CODES.SESSION_NOT_FOUND);
      expect(actual?.statusCode).toBe(404);
    });

    // 场景 3：用户没有任何活跃会话
    // 用户的会话列表为空 → 抛出 SESSION_NOT_FOUND
    it('should throw SESSION_NOT_FOUND if user has no sessions', async () => {
      vi.mocked(tokenService.getUserSessions).mockResolvedValue([]);

      let actual: { code: string } | null = null;
      try {
        await sessionService.revokeSession('user-123', 'session-1');
      } catch (error) {
        actual = { code: (error as AppError).code };
      }

      const expected = { code: AUTH_ERROR_CODES.SESSION_NOT_FOUND };
      logTestInfo(
        { userId: 'user-123', sessionId: 'session-1', userSessions: [] },
        expected,
        actual
      );

      expect(actual?.code).toBe(AUTH_ERROR_CODES.SESSION_NOT_FOUND);
    });
  });
});
