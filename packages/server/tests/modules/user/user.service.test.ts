import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@core/errors';
import { mockUser, logTestInfo } from '@tests/__mocks__/auth.mocks';

vi.mock('@modules/user/repositories/user.repository', () => ({
  userRepository: {
    findById: vi.fn(),
    existsByEmailExcludingUser: vi.fn(),
    updateEmail: vi.fn(),
  },
}));

vi.mock('@modules/auth/verification/email-verification.service', () => ({
  emailVerificationService: {
    verifyToken: vi.fn(),
  },
}));

vi.mock('@core/db/db.utils', () => ({
  withTransaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback({})),
}));

vi.mock('@core/utils', () => ({
  normalizeEmail: vi.fn((email: string) => email.trim().toLowerCase()),
  toUserPublicInfo: vi.fn((user: typeof mockUser) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    status: user.status,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  })),
}));

import { userService } from '@modules/user';
import { userRepository } from '@modules/user/repositories/user.repository';
import { emailVerificationService } from '@modules/auth/verification/email-verification.service';

describe('userService > changeEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userRepository.findById).mockResolvedValue(mockUser);
  });

  it('should update email after verifying the new address', async () => {
    const updatedUser = {
      ...mockUser,
      email: 'fresh@example.com',
      emailVerified: true,
    };
    vi.mocked(emailVerificationService.verifyToken).mockReturnValue({
      email: 'fresh@example.com',
    });
    vi.mocked(userRepository.existsByEmailExcludingUser).mockResolvedValue(false);
    vi.mocked(userRepository.updateEmail).mockResolvedValue(updatedUser);

    const result = await userService.changeEmail(mockUser.id, {
      newEmail: 'Fresh@Example.com',
      verificationToken: 'verified-change-email-token',
    });

    logTestInfo(
      { userId: mockUser.id, newEmail: 'Fresh@Example.com' },
      { email: 'fresh@example.com', verified: true },
      { email: result.email, verified: result.emailVerified }
    );

    expect(emailVerificationService.verifyToken).toHaveBeenCalledWith(
      'verified-change-email-token',
      'change_email'
    );
    expect(userRepository.existsByEmailExcludingUser).toHaveBeenCalledWith(
      'fresh@example.com',
      mockUser.id
    );
    expect(userRepository.updateEmail).toHaveBeenCalledWith(mockUser.id, 'fresh@example.com', {});
    expect(result.email).toBe('fresh@example.com');
    expect(result.emailVerified).toBe(true);
  });

  it('should reject when the new email matches the current email', async () => {
    let actual: { code: string; statusCode: number } | null = null;

    try {
      await userService.changeEmail(mockUser.id, {
        newEmail: mockUser.email,
        verificationToken: 'verified-change-email-token',
      });
    } catch (error) {
      actual = {
        code: (error as AppError).code,
        statusCode: (error as AppError).statusCode,
      };
    }

    const expected = { code: 'VALIDATION_ERROR', statusCode: 400 };
    logTestInfo({ currentEmail: mockUser.email }, expected, actual);

    expect(actual).toEqual(expected);
    expect(emailVerificationService.verifyToken).not.toHaveBeenCalled();
  });

  it('should reject when the verification token email does not match', async () => {
    vi.mocked(emailVerificationService.verifyToken).mockReturnValue({
      email: 'other@example.com',
    });

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await userService.changeEmail(mockUser.id, {
        newEmail: 'fresh@example.com',
        verificationToken: 'verified-change-email-token',
      });
    } catch (error) {
      actual = {
        code: (error as AppError).code,
        statusCode: (error as AppError).statusCode,
      };
    }

    const expected = { code: AUTH_ERROR_CODES.TOKEN_INVALID, statusCode: 400 };
    logTestInfo({ verifiedEmail: 'other@example.com' }, expected, actual);

    expect(actual).toEqual(expected);
    expect(userRepository.updateEmail).not.toHaveBeenCalled();
  });

  it('should reject when the new email is already taken', async () => {
    vi.mocked(emailVerificationService.verifyToken).mockReturnValue({
      email: 'fresh@example.com',
    });
    vi.mocked(userRepository.existsByEmailExcludingUser).mockResolvedValue(true);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await userService.changeEmail(mockUser.id, {
        newEmail: 'fresh@example.com',
        verificationToken: 'verified-change-email-token',
      });
    } catch (error) {
      actual = {
        code: (error as AppError).code,
        statusCode: (error as AppError).statusCode,
      };
    }

    const expected = { code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS, statusCode: 400 };
    logTestInfo({ newEmail: 'fresh@example.com', emailTaken: true }, expected, actual);

    expect(actual).toEqual(expected);
    expect(userRepository.updateEmail).not.toHaveBeenCalled();
  });
});
