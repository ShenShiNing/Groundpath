import bcrypt from 'bcryptjs';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import type {
  LoginRequest,
  AuthResponse,
  DeviceInfo,
  UserPublicInfo,
} from '@knowledge-agent/shared/types';
import type { AccessTokenPayload } from '../types/authTypes';
import { toUserPublicInfo } from '../types/authTypes';
import { AuthError } from '../utils/errors';
import { verifyRefreshToken } from '../utils/jwtUtils';
import { userRepository } from '../repositories/userRepository';
import { loginLogRepository } from '../repositories/loginLogRepository';
import { tokenService } from './tokenService';
import { checkAccountRateLimit, resetAccountRateLimit } from '../middleware/rateLimitMiddleware';

/**
 * Authentication service for handling login/logout operations
 */
export const authService = {
  /**
   * Authenticate user with email and password
   */
  async login(
    credentials: LoginRequest,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<AuthResponse> {
    const { email, password, deviceInfo } = credentials;

    // Check account-level rate limit before any database operations
    const rateCheck = checkAccountRateLimit(email);
    if (!rateCheck.allowed) {
      const minutes = Math.ceil((rateCheck.retryAfter ?? 0) / 60);
      throw new AuthError(
        AUTH_ERROR_CODES.RATE_LIMITED,
        `Too many failed login attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        429
      );
    }

    // Find user by email
    const user = await userRepository.findByEmail(email);

    if (!user || !user.password) {
      // Record failed attempt
      await loginLogRepository.recordFailure(
        email,
        'password',
        'Invalid credentials',
        ipAddress,
        userAgent
      );
      throw new AuthError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await loginLogRepository.recordFailure(
        email,
        'password',
        'Invalid password',
        ipAddress,
        userAgent,
        user.id
      );
      throw new AuthError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    // Check user status
    if (user.status === 'banned') {
      await loginLogRepository.recordFailure(
        email,
        'password',
        'Account banned',
        ipAddress,
        userAgent,
        user.id
      );
      throw new AuthError(AUTH_ERROR_CODES.USER_BANNED, 'Your account has been banned', 403);
    }

    // Optional: Check email verification
    // Uncomment if you want to require email verification
    // if (!user.emailVerified) {
    //   throw new AuthError(
    //     AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
    //     'Please verify your email before logging in',
    //     403
    //   );
    // }

    // Record successful login
    await loginLogRepository.recordSuccess(user.id, email, 'password', ipAddress, userAgent);

    // Reset account rate limit on successful login
    resetAccountRateLimit(email);

    // Update last login info
    await userRepository.updateLastLogin(user.id, ipAddress);

    // Generate tokens
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      status: user.status,
      emailVerified: user.emailVerified,
    };

    const tokens = await tokenService.generateTokenPair(
      accessPayload,
      ipAddress,
      deviceInfo ?? parseDeviceInfo(userAgent)
    );

    return {
      user: toUserPublicInfo(user),
      tokens,
    };
  },

  /**
   * Refresh access token using refresh token
   */
  async refresh(
    refreshToken: string,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<AuthResponse> {
    const deviceInfo = parseDeviceInfo(userAgent);
    const tokens = await tokenService.refreshTokens(refreshToken, ipAddress, deviceInfo);

    // Get user info for response - decode the new refresh token to get user ID
    const { sub } = verifyRefreshToken(tokens.refreshToken);
    const user = await userRepository.findById(sub);

    if (!user) {
      throw new AuthError(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
    }

    return {
      user: toUserPublicInfo(user),
      tokens,
    };
  },

  /**
   * Logout current device (revoke current refresh token)
   */
  async logout(tokenId: string): Promise<void> {
    await tokenService.revokeToken(tokenId);
  },

  /**
   * Logout all devices (revoke all refresh tokens)
   */
  async logoutAll(userId: string): Promise<number> {
    return tokenService.revokeAllUserTokens(userId);
  },

  /**
   * Get current user info
   */
  async getCurrentUser(userId: string): Promise<UserPublicInfo> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AuthError(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
    }
    return toUserPublicInfo(user);
  },

  /**
   * Get active sessions for current user
   */
  async getSessions(userId: string, currentTokenId?: string) {
    return tokenService.getUserSessions(userId, currentTokenId);
  },

  /**
   * Revoke a specific session
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    // Verify the session belongs to the user by checking via token service
    const sessions = await tokenService.getUserSessions(userId);
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      throw new AuthError(AUTH_ERROR_CODES.SESSION_NOT_FOUND, 'Session not found', 404);
    }

    await tokenService.revokeToken(sessionId);
  },
};

/**
 * Parse device info from user agent string
 * Basic implementation - can be enhanced with a proper UA parser library
 */
function parseDeviceInfo(userAgent: string | null): DeviceInfo | null {
  if (!userAgent) return null;

  const deviceInfo: DeviceInfo = {
    userAgent,
  };

  // Basic device type detection
  if (/mobile/i.test(userAgent)) {
    deviceInfo.deviceType = 'mobile';
  } else if (/tablet/i.test(userAgent)) {
    deviceInfo.deviceType = 'tablet';
  } else {
    deviceInfo.deviceType = 'desktop';
  }

  // Basic OS detection
  if (/windows/i.test(userAgent)) {
    deviceInfo.os = 'Windows';
  } else if (/macintosh|mac os/i.test(userAgent)) {
    deviceInfo.os = 'macOS';
  } else if (/linux/i.test(userAgent)) {
    deviceInfo.os = 'Linux';
  } else if (/android/i.test(userAgent)) {
    deviceInfo.os = 'Android';
  } else if (/iphone|ipad/i.test(userAgent)) {
    deviceInfo.os = 'iOS';
  }

  // Basic browser detection
  if (/chrome/i.test(userAgent) && !/edg/i.test(userAgent)) {
    deviceInfo.browser = 'Chrome';
  } else if (/firefox/i.test(userAgent)) {
    deviceInfo.browser = 'Firefox';
  } else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) {
    deviceInfo.browser = 'Safari';
  } else if (/edg/i.test(userAgent)) {
    deviceInfo.browser = 'Edge';
  }

  return deviceInfo;
}
