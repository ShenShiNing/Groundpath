import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type { DeviceInfo } from '@knowledge-agent/shared/types';
import { tokenService } from '@modules/auth';
import { AppError } from '@shared/errors';
import type { AccessTokenSubject } from '@shared/types';

// ==================== Mocks ====================

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-token-id'),
}));

vi.mock('@shared/utils/jwt.utils', () => ({
  generateAccessToken: vi.fn(() => 'mock-access-token'),
  generateRefreshToken: vi.fn(() => 'mock-refresh-token'),
  verifyRefreshToken: vi.fn(),
}));

vi.mock('@modules/auth/repositories/refresh-token.repository', () => ({
  refreshTokenRepository: {
    create: vi.fn(),
    findValidById: vi.fn(),
    findById: vi.fn(),
    consumeIfValid: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
    getActiveSessionsForUser: vi.fn(),
    updateLastUsed: vi.fn(),
    wasUsedWithinSeconds: vi.fn(),
  },
}));

vi.mock('@modules/auth/repositories/user-token-state.repository', () => ({
  userTokenStateRepository: {
    bumpTokenValidAfter: vi.fn(),
  },
}));

// Mock userService (not userRepository) - tokenService uses userService.findById
vi.mock('@modules/user', () => ({
  userService: {
    findById: vi.fn(),
  },
}));

vi.mock('@config/auth.config', () => ({
  AUTH_CONFIG: {
    accessToken: { expiresInSeconds: 900 },
    refreshToken: { expiresInSeconds: 604800 },
  },
}));

// Mock withTransaction to bypass real database
vi.mock('@shared/db/db.utils', () => ({
  withTransaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback({})),
  getDbContext: vi.fn((tx?: unknown) => tx ?? {}),
}));

// Import mocked modules
import { refreshTokenRepository } from '@modules/auth';
import { userTokenStateRepository } from '@modules/auth/repositories/user-token-state.repository';
import { userService } from '@modules/user';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '@shared/utils/jwt.utils';

// ==================== 日志辅助函数 ====================

function logTestInfo(input: unknown, expected: unknown, actual: unknown) {
  console.log(`  测试输入：${JSON.stringify(input)}`);
  console.log(`  预期结果：${JSON.stringify(expected)}`);
  console.log(`  实际结果：${JSON.stringify(actual)}`);
}

describe('tokenService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== generateTokenPair ====================
  // 场景：为已认证用户生成 access + refresh 令牌对
  // 职责：调用 JWT 工具生成令牌、将 refresh token 存入数据库、返回完整的 TokenPair
  describe('generateTokenPair', () => {
    const validUser: AccessTokenSubject = {
      sub: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      status: 'active',
      emailVerified: true,
    };
    const ipAddress = '192.168.1.1';
    const deviceInfo: DeviceInfo = {
      userAgent: 'Mozilla/5.0',
      deviceType: 'desktop',
      os: 'Windows',
      browser: 'Chrome',
    };

    // 场景 1：正常生成令牌对
    // 给定合法的用户信息，应返回包含 accessToken、refreshToken 及过期时间的完整对象
    it('should generate access and refresh tokens', async () => {
      vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never);

      const result = await tokenService.generateTokenPair(validUser, ipAddress, deviceInfo);

      const expected = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      };
      logTestInfo({ user: validUser.sub, ip: ipAddress }, expected, result);

      expect(result).toEqual(expected);
    });

    // 场景 2：验证 generateAccessToken 被正确调用
    // 确保将完整的用户 payload 传给 JWT 工具函数
    it('should call generateAccessToken with user payload', async () => {
      vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never);

      await tokenService.generateTokenPair(validUser, ipAddress, deviceInfo);

      const calledWith = vi.mocked(generateAccessToken).mock.calls[0]?.[0];
      const expectedPayload = { ...validUser, sid: 'mock-uuid-token-id' };
      logTestInfo({ user: validUser }, { calledWith: expectedPayload }, { calledWith });

      expect(generateAccessToken).toHaveBeenCalledWith(expectedPayload);
    });

    // 场景 3：验证 generateRefreshToken 接收正确的 userId 和 tokenId
    // tokenId 由 uuid.v4() 生成（已 mock 为 'mock-uuid-token-id'）
    it('should call generateRefreshToken with user ID and token ID', async () => {
      vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never);

      await tokenService.generateTokenPair(validUser, ipAddress, deviceInfo);

      const calledWith = vi.mocked(generateRefreshToken).mock.calls[0];
      logTestInfo(
        { userId: 'user-123' },
        { calledWith: ['user-123', 'mock-uuid-token-id'] },
        { calledWith }
      );

      expect(generateRefreshToken).toHaveBeenCalledWith('user-123', 'mock-uuid-token-id');
    });

    // 场景 4：refresh token 持久化到数据库
    // 确保调用 repository.create 并传入正确的参数（tokenId、userId、token 字符串、IP、设备信息、tx）
    it('should store refresh token in database', async () => {
      vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never);

      await tokenService.generateTokenPair(validUser, ipAddress, deviceInfo);

      const calledWith = vi.mocked(refreshTokenRepository.create).mock.calls[0];
      const expected = [
        'mock-uuid-token-id',
        'user-123',
        'mock-refresh-token',
        ipAddress,
        deviceInfo,
        undefined, // tx parameter (undefined when called without transaction)
      ];
      logTestInfo(
        { userId: validUser.sub, ip: ipAddress, deviceInfo },
        { repositoryCalledWith: expected },
        { repositoryCalledWith: calledWith }
      );

      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        'mock-uuid-token-id',
        'user-123',
        'mock-refresh-token',
        ipAddress,
        deviceInfo,
        undefined
      );
    });

    // 场景 5：IP 地址为 null（如无法获取客户端 IP）
    // 应正常生成令牌，数据库记录中 IP 字段为 null
    it('should handle null IP address', async () => {
      vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never);

      await tokenService.generateTokenPair(validUser, null, deviceInfo);

      const calledIp = vi.mocked(refreshTokenRepository.create).mock.calls[0]?.[3];
      logTestInfo({ ip: null }, { storedIp: null }, { storedIp: calledIp });

      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        'mock-uuid-token-id',
        'user-123',
        'mock-refresh-token',
        null,
        deviceInfo,
        undefined
      );
    });

    // 场景 6：设备信息为 null（如请求无 User-Agent）
    // 应正常生成令牌，数据库记录中设备信息字段为 null
    it('should handle null device info', async () => {
      vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never);

      await tokenService.generateTokenPair(validUser, ipAddress, null);

      const calledDeviceInfo = vi.mocked(refreshTokenRepository.create).mock.calls[0]?.[4];
      logTestInfo(
        { deviceInfo: null },
        { storedDeviceInfo: null },
        { storedDeviceInfo: calledDeviceInfo }
      );

      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        'mock-uuid-token-id',
        'user-123',
        'mock-refresh-token',
        ipAddress,
        null,
        undefined
      );
    });
  });

  // ==================== refreshTokens ====================
  // 场景：使用有效 refresh token 换取新的令牌对（token rotation）
  // 职责：JWT 验证 → 数据库查找 → token 字符串比对 → 用户状态检查 → 吊销旧 token → 生成新令牌对
  describe('refreshTokens', () => {
    const mockRefreshToken = 'valid-refresh-token';
    const ipAddress = '192.168.1.1';
    const deviceInfo: DeviceInfo = { userAgent: 'Mozilla/5.0' };

    const mockPayload = {
      sub: 'user-123',
      sid: 'token-id-456',
      jti: 'token-id-456',
      type: 'refresh' as const,
    };

    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      password: 'hashed',
      avatarUrl: null,
      bio: null,
      status: 'active' as const,
      emailVerified: true,
      emailVerifiedAt: null,
      lastLoginAt: null,
      lastLoginIp: null,
      createdBy: null,
      createdAt: new Date(),
      updatedBy: null,
      updatedAt: new Date(),
      deletedBy: null,
      deletedAt: null,
    };

    // 场景 1：正常刷新 — JWT 有效、数据库中存在、token 匹配、用户状态正常
    // 应吊销旧 token 并返回全新的令牌对
    it('should refresh tokens successfully', async () => {
      vi.mocked(verifyRefreshToken).mockReturnValue(mockPayload);
      vi.mocked(refreshTokenRepository.consumeIfValid).mockResolvedValue('consumed');
      vi.mocked(userService.findById).mockResolvedValue(mockUser);
      vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never);

      const result = await tokenService.refreshTokens(mockRefreshToken, ipAddress, deviceInfo);

      const expected = {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      };
      logTestInfo({ refreshToken: mockRefreshToken }, expected, result);

      expect(result).toEqual(expected);
    });

    // 场景 2：验证 JWT 签名和结构
    // 确保 verifyRefreshToken 被调用以验证传入的 refresh token
    it('should verify the refresh token JWT', async () => {
      vi.mocked(verifyRefreshToken).mockReturnValue(mockPayload);
      vi.mocked(refreshTokenRepository.consumeIfValid).mockResolvedValue('consumed');
      vi.mocked(userService.findById).mockResolvedValue(mockUser);
      vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never);

      await tokenService.refreshTokens(mockRefreshToken, ipAddress, deviceInfo);

      const calledWith = vi.mocked(verifyRefreshToken).mock.calls[0]?.[0];
      logTestInfo(
        { refreshToken: mockRefreshToken },
        { verifyCalledWith: mockRefreshToken },
        { verifyCalledWith: calledWith }
      );

      expect(verifyRefreshToken).toHaveBeenCalledWith(mockRefreshToken);
    });

    // 场景 3：token 已被吊销或不存在于数据库
    // JWT 验证通过但数据库中找不到有效记录 → 抛出 TOKEN_REVOKED
    it('should throw TOKEN_REVOKED if token not found in database', async () => {
      vi.mocked(verifyRefreshToken).mockReturnValue(mockPayload);
      vi.mocked(refreshTokenRepository.consumeIfValid).mockResolvedValue('not_found');

      let actual: { code: string; message: string } | null = null;
      try {
        await tokenService.refreshTokens(mockRefreshToken, ipAddress, deviceInfo);
      } catch (error) {
        actual = { code: (error as AppError).code, message: (error as AppError).message };
      }

      const expected = {
        code: AUTH_ERROR_CODES.TOKEN_REVOKED,
        message: 'Refresh token has been revoked',
      };
      logTestInfo({ refreshToken: mockRefreshToken, dbResult: undefined }, expected, actual);

      expect(actual?.code).toBe(AUTH_ERROR_CODES.TOKEN_REVOKED);
    });

    // 场景 4：token 重用攻击检测
    // JWT 解码的 jti 在数据库中存在，但 token 字符串不匹配（说明旧 token 被重用）
    // 安全措施：吊销该用户的所有 token → 抛出 TOKEN_INVALID
    it('should revoke all tokens on token mismatch (reuse attack)', async () => {
      vi.mocked(verifyRefreshToken).mockReturnValue(mockPayload);
      vi.mocked(refreshTokenRepository.consumeIfValid).mockResolvedValue('token_mismatch');
      vi.mocked(refreshTokenRepository.revokeAllForUser).mockResolvedValue(3);
      vi.mocked(userTokenStateRepository.bumpTokenValidAfter).mockResolvedValue(undefined);

      let actual: { code: string; revokedAll: boolean } | null = null;
      try {
        await tokenService.refreshTokens(mockRefreshToken, ipAddress, deviceInfo);
      } catch (error) {
        actual = {
          code: (error as AppError).code,
          revokedAll: vi.mocked(refreshTokenRepository.revokeAllForUser).mock.calls.length > 0,
        };
      }

      const expected = { code: AUTH_ERROR_CODES.TOKEN_INVALID, revokedAll: true };
      logTestInfo({ inputToken: mockRefreshToken, consumeResult: 'token_mismatch' }, expected, actual);

      expect(actual?.revokedAll).toBe(true);
      expect(actual?.code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('user-123', {});
    });

    // 场景 5：用户不存在（可能已被删除）
    // token 在数据库中有效，但对应的用户已不存在 → 吊销该 token → 抛出 TOKEN_INVALID
    it('should throw TOKEN_INVALID if user not found', async () => {
      vi.mocked(verifyRefreshToken).mockReturnValue(mockPayload);
      vi.mocked(refreshTokenRepository.consumeIfValid).mockResolvedValue('consumed');
      vi.mocked(userService.findById).mockResolvedValue(undefined);

      let actual: { code: string } | null = null;
      try {
        await tokenService.refreshTokens(mockRefreshToken, ipAddress, deviceInfo);
      } catch (error) {
        actual = { code: (error as AppError).code };
      }

      const expected = { code: AUTH_ERROR_CODES.TOKEN_INVALID };
      logTestInfo({ userId: mockPayload.sub, userDbResult: undefined }, expected, actual);

      expect(actual?.code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
    });

    // 场景 6：用户已被封禁
    // token 有效但用户状态为 banned → 吊销该用户所有 token → 抛出 USER_BANNED (403)
    it('should revoke all tokens and throw USER_BANNED if user is banned', async () => {
      const bannedUser = { ...mockUser, status: 'banned' as const };
      vi.mocked(verifyRefreshToken).mockReturnValue(mockPayload);
      vi.mocked(refreshTokenRepository.consumeIfValid).mockResolvedValue('consumed');
      vi.mocked(userService.findById).mockResolvedValue(bannedUser);
      vi.mocked(refreshTokenRepository.revokeAllForUser).mockResolvedValue(2);
      vi.mocked(userTokenStateRepository.bumpTokenValidAfter).mockResolvedValue(undefined);

      let actual: { code: string; statusCode: number; revokedAll: boolean } | null = null;
      try {
        await tokenService.refreshTokens(mockRefreshToken, ipAddress, deviceInfo);
      } catch (error) {
        actual = {
          code: (error as AppError).code,
          statusCode: (error as AppError).statusCode,
          revokedAll: vi.mocked(refreshTokenRepository.revokeAllForUser).mock.calls.length > 0,
        };
      }

      const expected = { code: AUTH_ERROR_CODES.USER_BANNED, statusCode: 403, revokedAll: true };
      logTestInfo({ userStatus: 'banned' }, expected, actual);

      expect(actual?.code).toBe(AUTH_ERROR_CODES.USER_BANNED);
      expect(actual?.statusCode).toBe(403);
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('user-123', {});
    });

    // 场景 7：令牌轮换 — 旧 token 原子消费
    // 刷新成功后，旧 token 应通过 consumeIfValid 被一次性消费
    it('should consume old token atomically during rotation', async () => {
      vi.mocked(verifyRefreshToken).mockReturnValue(mockPayload);
      vi.mocked(refreshTokenRepository.consumeIfValid).mockResolvedValue('consumed');
      vi.mocked(userService.findById).mockResolvedValue(mockUser);
      vi.mocked(refreshTokenRepository.create).mockResolvedValue({} as never);

      await tokenService.refreshTokens(mockRefreshToken, ipAddress, deviceInfo);

      const consumedCall = vi.mocked(refreshTokenRepository.consumeIfValid).mock.calls[0];
      logTestInfo(
        { oldTokenJti: 'token-id-456' },
        { consumeCalledWith: ['token-id-456', mockRefreshToken, {}] },
        { consumeCalledWith: consumedCall }
      );

      expect(refreshTokenRepository.consumeIfValid).toHaveBeenCalledWith(
        'token-id-456',
        mockRefreshToken,
        {}
      );
    });
  });

  // ==================== revokeToken ====================
  // 场景：单设备登出 — 吊销指定的 refresh token
  describe('revokeToken', () => {
    // 场景 1：传入 tokenId，委托 repository 吊销
    it('should revoke the specified token', async () => {
      vi.mocked(refreshTokenRepository.revoke).mockResolvedValue(undefined);

      await tokenService.revokeToken('token-123');

      const calledWith = vi.mocked(refreshTokenRepository.revoke).mock.calls[0]?.[0];
      logTestInfo(
        { tokenId: 'token-123' },
        { revokedTokenId: 'token-123' },
        { revokedTokenId: calledWith }
      );

      expect(refreshTokenRepository.revoke).toHaveBeenCalledWith('token-123');
    });
  });

  // ==================== revokeAllUserTokens ====================
  // 场景：全设备登出 — 吊销用户的所有 refresh token
  describe('revokeAllUserTokens', () => {
    // 场景 1：用户有多个活跃 token，全部吊销并返回数量
    it('should revoke all tokens for user and return count', async () => {
      vi.mocked(refreshTokenRepository.revokeAllForUser).mockResolvedValue(5);

      const result = await tokenService.revokeAllUserTokens('user-123');

      logTestInfo({ userId: 'user-123' }, { revokedCount: 5 }, { revokedCount: result });

      expect(result).toBe(5);
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('user-123');
    });

    // 场景 2：用户没有活跃 token，返回 0
    it('should return 0 if no tokens to revoke', async () => {
      vi.mocked(refreshTokenRepository.revokeAllForUser).mockResolvedValue(0);

      const result = await tokenService.revokeAllUserTokens('user-no-tokens');

      logTestInfo({ userId: 'user-no-tokens' }, { revokedCount: 0 }, { revokedCount: result });

      expect(result).toBe(0);
    });
  });

  // ==================== getUserSessions ====================
  // 场景：获取用户的所有活跃会话列表
  // 职责：从数据库获取会话 → 格式化（去除敏感的 token 字段） → 标记当前会话
  describe('getUserSessions', () => {
    const mockSessions = [
      {
        id: 'session-1',
        userId: 'user-123',
        token: 'token-1',
        expiresAt: new Date('2024-01-30'),
        revoked: false,
        revokedAt: null,
        ipAddress: '192.168.1.1',
        deviceInfo: { userAgent: 'Chrome' },
        createdAt: new Date('2024-01-15'),
        lastUsedAt: new Date('2024-01-20'),
      },
      {
        id: 'session-2',
        userId: 'user-123',
        token: 'token-2',
        expiresAt: new Date('2024-01-30'),
        revoked: false,
        revokedAt: null,
        ipAddress: '10.0.0.1',
        deviceInfo: { userAgent: 'Firefox' },
        createdAt: new Date('2024-01-10'),
        lastUsedAt: new Date('2024-01-18'),
      },
    ];

    // 场景 1：返回格式化后的会话列表（不含 token 字符串等敏感信息）
    it('should return formatted sessions without sensitive fields', async () => {
      vi.mocked(refreshTokenRepository.getActiveSessionsForUser).mockResolvedValue(mockSessions);

      const result = await tokenService.getUserSessions('user-123');

      const expected = {
        id: 'session-1',
        deviceInfo: { userAgent: 'Chrome' },
        ipAddress: '192.168.1.1',
        isCurrent: false,
      };
      logTestInfo(
        { userId: 'user-123', sessionCount: mockSessions.length },
        { firstSession: expected, totalCount: 2 },
        {
          firstSession: {
            id: result[0]?.id,
            deviceInfo: result[0]?.deviceInfo,
            ipAddress: result[0]?.ipAddress,
            isCurrent: result[0]?.isCurrent,
          },
          totalCount: result.length,
        }
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'session-1',
        deviceInfo: { userAgent: 'Chrome' },
        ipAddress: '192.168.1.1',
        createdAt: new Date('2024-01-15'),
        lastUsedAt: new Date('2024-01-20'),
        isCurrent: false,
      });
    });

    // 场景 2：传入 currentTokenId 时，匹配的会话标记 isCurrent = true
    it('should mark current session correctly', async () => {
      vi.mocked(refreshTokenRepository.getActiveSessionsForUser).mockResolvedValue(mockSessions);

      const result = await tokenService.getUserSessions('user-123', 'session-1');

      logTestInfo(
        { userId: 'user-123', currentTokenId: 'session-1' },
        { session1IsCurrent: true, session2IsCurrent: false },
        { session1IsCurrent: result[0]?.isCurrent, session2IsCurrent: result[1]?.isCurrent }
      );

      expect(result[0]?.isCurrent).toBe(true);
      expect(result[1]?.isCurrent).toBe(false);
    });

    // 场景 3：用户无活跃会话，返回空数组
    it('should return empty array if no sessions', async () => {
      vi.mocked(refreshTokenRepository.getActiveSessionsForUser).mockResolvedValue([]);

      const result = await tokenService.getUserSessions('user-123');

      logTestInfo({ userId: 'user-123', dbSessions: [] }, { result: [] }, { result });

      expect(result).toEqual([]);
    });

    // 场景 4：不传 currentTokenId 时，所有会话的 isCurrent 均为 false
    it('should not mark any session as current if currentTokenId not provided', async () => {
      vi.mocked(refreshTokenRepository.getActiveSessionsForUser).mockResolvedValue(mockSessions);

      const result = await tokenService.getUserSessions('user-123');

      const allFalse = result.every((s) => s.isCurrent === false);
      logTestInfo(
        { userId: 'user-123', currentTokenId: undefined },
        { allIsCurrentFalse: true },
        { allIsCurrentFalse: allFalse }
      );

      expect(allFalse).toBe(true);
    });
  });
});
