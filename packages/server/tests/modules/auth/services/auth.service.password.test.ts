import { describe, expect, it, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@shared/errors';
import { mockUser, logTestInfo } from '@tests/__mocks__/auth.mocks';

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

// Mock userService (not userRepository) - authService uses userService
vi.mock('@modules/user', () => ({
  userService: {
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
}));

// Mock withTransaction to bypass real database
vi.mock('@shared/db/db.utils', () => ({
  withTransaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback({})),
  getDbContext: vi.fn((tx?: unknown) => tx ?? {}),
}));

// Import after mocks
import { authService } from '@modules/auth/services/auth.service';
import { userService } from '@modules/user';
import { refreshTokenRepository } from '@modules/auth/repositories/refresh-token.repository';

// ==================== changePassword ====================
// 场景：用户修改密码
// 职责：查找用户 → 验证旧密码 → 哈希新密码 → 更新密码 → 吊销所有令牌
describe('authService > changePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const userId = 'user-123';
  const oldPassword = 'OldPassword123';
  const newPassword = 'NewPassword456';

  // 场景 1：正常修改密码
  // 应验证旧密码、哈希新密码、更新数据库、吊销所有令牌
  it('should change password successfully with valid old password', async () => {
    vi.mocked(userService.findById).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$newhashedpassword' as never);
    vi.mocked(userService.updatePassword).mockResolvedValue(undefined);
    vi.mocked(refreshTokenRepository.revokeAllForUser).mockResolvedValue(3);

    await authService.changePassword(userId, oldPassword, newPassword);

    logTestInfo(
      { userId, oldPassword: '***', newPassword: '***' },
      { passwordUpdated: true, tokensRevoked: true },
      {
        passwordUpdated: vi.mocked(userService.updatePassword).mock.calls.length > 0,
        tokensRevoked: vi.mocked(refreshTokenRepository.revokeAllForUser).mock.calls.length > 0,
      }
    );

    expect(userService.updatePassword).toHaveBeenCalledWith(userId, '$2a$12$newhashedpassword', {});
    expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(userId, {});
  });

  // 场景 2：验证旧密码是否正确比对
  // 应使用 bcrypt.compare 验证旧密码
  it('should verify old password with bcrypt', async () => {
    vi.mocked(userService.findById).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$newhashedpassword' as never);
    vi.mocked(userService.updatePassword).mockResolvedValue(undefined);
    vi.mocked(refreshTokenRepository.revokeAllForUser).mockResolvedValue(3);

    await authService.changePassword(userId, oldPassword, newPassword);

    const compareCalls = vi.mocked(bcrypt.compare).mock.calls;
    logTestInfo(
      { oldPassword: '***' },
      { comparedWith: [oldPassword, mockUser.password] },
      { comparedWith: compareCalls[0] }
    );

    expect(bcrypt.compare).toHaveBeenCalledWith(oldPassword, mockUser.password);
  });

  // 场景 3：验证新密码正确哈希
  // 应使用 bcrypt.hash 对新密码进行哈希
  it('should hash new password with bcrypt', async () => {
    vi.mocked(userService.findById).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$newhashedpassword' as never);
    vi.mocked(userService.updatePassword).mockResolvedValue(undefined);
    vi.mocked(refreshTokenRepository.revokeAllForUser).mockResolvedValue(3);

    await authService.changePassword(userId, oldPassword, newPassword);

    const hashCalls = vi.mocked(bcrypt.hash).mock.calls;
    logTestInfo(
      { newPassword: '***' },
      { hashCalledWith: [newPassword, 12] },
      { hashCalledWith: hashCalls[0] }
    );

    expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
  });

  // 场景 4：用户不存在
  // 应抛出 TOKEN_INVALID 错误
  it('should throw TOKEN_INVALID when user not found', async () => {
    vi.mocked(userService.findById).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await authService.changePassword(userId, oldPassword, newPassword);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    const expected = { code: AUTH_ERROR_CODES.TOKEN_INVALID };
    logTestInfo({ userId, userExists: false }, expected, actual);

    expect(actual?.code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
  });

  // 场景 5：用户没有密码（OAuth 用户）
  // 应抛出 TOKEN_INVALID 错误
  it('should throw TOKEN_INVALID when user has no password (OAuth user)', async () => {
    const oauthUser = { ...mockUser, password: null };
    vi.mocked(userService.findById).mockResolvedValue(oauthUser);

    let actual: { code: string } | null = null;
    try {
      await authService.changePassword(userId, oldPassword, newPassword);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    const expected = { code: AUTH_ERROR_CODES.TOKEN_INVALID };
    logTestInfo({ userId, hasPassword: false }, expected, actual);

    expect(actual?.code).toBe(AUTH_ERROR_CODES.TOKEN_INVALID);
  });

  // 场景 6：旧密码不正确
  // 应抛出 INVALID_PASSWORD 错误 (400)
  it('should throw INVALID_PASSWORD when old password is incorrect', async () => {
    vi.mocked(userService.findById).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await authService.changePassword(userId, oldPassword, newPassword);
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    const expected = { code: AUTH_ERROR_CODES.INVALID_PASSWORD, statusCode: 400 };
    logTestInfo({ userId, oldPasswordCorrect: false }, expected, actual);

    expect(actual?.code).toBe(AUTH_ERROR_CODES.INVALID_PASSWORD);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 7：密码更新后应吊销所有 refresh token
  // 安全措施：强制所有设备重新登录
  it('should revoke all refresh tokens after password change', async () => {
    vi.mocked(userService.findById).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$newhashedpassword' as never);
    vi.mocked(userService.updatePassword).mockResolvedValue(undefined);
    vi.mocked(refreshTokenRepository.revokeAllForUser).mockResolvedValue(5);

    await authService.changePassword(userId, oldPassword, newPassword);

    const revokeCalls = vi.mocked(refreshTokenRepository.revokeAllForUser).mock.calls;
    logTestInfo(
      { userId },
      { revokedForUser: userId, callCount: 1 },
      { revokedForUser: revokeCalls[0]?.[0], callCount: revokeCalls.length }
    );

    expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(userId, {});
    expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledTimes(1);
  });
});
