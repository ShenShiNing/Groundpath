import type { EmailVerificationCodeType } from '@knowledge-agent/shared/types';

// ==================== Shared Test Data ====================

export const mockEmail = 'test@example.com';
export const mockCode = '123456';
export const mockIpAddress = '192.168.1.1';
export const mockVerificationToken = 'mock-verification-token-jwt';

export const mockVerificationCode = {
  id: 'code-uuid-123',
  email: mockEmail,
  code: mockCode,
  type: 'register' as EmailVerificationCodeType,
  used: false,
  usedAt: null,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  ipAddress: mockIpAddress,
  createdAt: new Date('2024-01-15T10:00:00Z'),
};

export const mockRecentCode = {
  ...mockVerificationCode,
  createdAt: new Date(Date.now() - 30 * 1000), // 30 seconds ago (within cooldown)
};

export const mockOldCode = {
  ...mockVerificationCode,
  createdAt: new Date(Date.now() - 120 * 1000), // 2 minutes ago (past cooldown)
};

// ==================== 日志辅助函数 ====================

export function logTestInfo(input: unknown, expected: unknown, actual: unknown) {
  console.log(`  测试输入：${JSON.stringify(input)}`);
  console.log(`  预期结果：${JSON.stringify(expected)}`);
  console.log(`  实际结果：${JSON.stringify(actual)}`);
}
