import type { TokenPair } from '@groundpath/shared/types';

// ==================== Shared Test Data ====================

export const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  password: '$2a$10$hashedpassword',
  avatarUrl: null,
  bio: null,
  status: 'active' as const,
  emailVerified: true,
  emailVerifiedAt: new Date(),
  lastLoginAt: null,
  lastLoginIp: null,
  createdBy: null,
  createdAt: new Date('2024-01-01'),
  updatedBy: null,
  updatedAt: new Date('2024-01-01'),
  deletedBy: null,
  deletedAt: null,
};

export const mockTokenPair: TokenPair = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 900,
  refreshExpiresIn: 604800,
};

export const mockCreatedUser = {
  id: 'generated-uuid-123',
  email: 'newuser@example.com',
  username: 'newuser',
  password: '$2a$12$hashedpassword',
  avatarUrl: null,
  bio: null,
  status: 'active' as const,
  emailVerified: false,
  emailVerifiedAt: null,
  lastLoginAt: null,
  lastLoginIp: null,
  createdBy: null,
  createdAt: new Date('2024-01-01'),
  updatedBy: null,
  updatedAt: new Date('2024-01-01'),
  deletedBy: null,
  deletedAt: null,
};

export const mockSessions = [
  {
    id: 'session-1',
    deviceInfo: { userAgent: 'Chrome' },
    ipAddress: '192.168.1.1',
    createdAt: new Date(),
    lastUsedAt: new Date(),
    isCurrent: true,
  },
  {
    id: 'session-2',
    deviceInfo: { userAgent: 'Firefox' },
    ipAddress: '10.0.0.1',
    createdAt: new Date(),
    lastUsedAt: new Date(),
    isCurrent: false,
  },
];

// ==================== 日志辅助函数 ====================

export function logTestInfo(input: unknown, expected: unknown, actual: unknown) {
  console.log(`  测试输入：${JSON.stringify(input)}`);
  console.log(`  预期结果：${JSON.stringify(expected)}`);
  console.log(`  实际结果：${JSON.stringify(actual)}`);
}
