import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { parseDeviceInfo } from '@knowledge-agent/shared/utils';
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  UserPublicInfo,
  DeviceInfo,
} from '@knowledge-agent/shared/types';
import type { User } from '../db/schema/user/users';
import type { AccessTokenPayload } from '../types/authTypes';
import { toUserPublicInfo } from '../types/authTypes';
import { AuthError } from '../utils/errors';
import { verifyRefreshToken } from '../utils/jwtUtils';
import { userRepository } from '../repositories/userRepository';
import { loginLogRepository } from '../repositories/loginLogRepository';
import { refreshTokenRepository } from '../repositories/refreshTokenRepository';
import { tokenService } from './tokenService';
import { checkAccountRateLimit, resetAccountRateLimit } from '../middleware/rateLimitMiddleware';

/**
 * Build access token payload and generate auth response with token pair.
 */
async function buildAuthResponse(
  user: User,
  ipAddress: string | null,
  deviceInfo: DeviceInfo | null
): Promise<AuthResponse> {
  const accessPayload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    username: user.username,
    status: user.status,
    emailVerified: user.emailVerified,
  };

  const tokens = await tokenService.generateTokenPair(accessPayload, ipAddress, deviceInfo);

  return {
    user: toUserPublicInfo(user),
    tokens,
  };
}

/**
 * Authentication service for handling login/logout operations
 */
export const authService = {
  /**
   * Register a new user
   */
  async register(
    data: RegisterRequest,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<AuthResponse> {
    const { username, email, password, deviceInfo } = data;

    // Check if email already exists
    const emailExists = await userRepository.existsByEmail(email);
    if (emailExists) {
      throw new AuthError(
        AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
        'An account with this email already exists',
        400
      );
    }

    // Check if username already exists
    const usernameExists = await userRepository.existsByUsername(username);
    if (usernameExists) {
      throw new AuthError(
        AUTH_ERROR_CODES.USERNAME_ALREADY_EXISTS,
        'This username is already taken',
        400
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const userId = uuidv4();
    const user = await userRepository.create({
      id: userId,
      username,
      email,
      password: hashedPassword,
      status: 'active',
    });

    // Record successful registration in login logs
    await loginLogRepository.recordSuccess(user.id, email, 'password', ipAddress, userAgent);

    // Update last login info
    await userRepository.updateLastLogin(user.id, ipAddress);

    return buildAuthResponse(user, ipAddress, deviceInfo ?? parseDeviceInfo(userAgent));
  },

  /**
   * Change user password
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    // Find user
    const user = await userRepository.findById(userId);
    if (!user || !user.password) {
      throw new AuthError(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
    }

    // Verify old password
    const isValidPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidPassword) {
      throw new AuthError(AUTH_ERROR_CODES.INVALID_PASSWORD, 'Current password is incorrect', 400);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await userRepository.updatePassword(userId, hashedPassword);

    // Revoke all refresh tokens for security (force re-login on all devices)
    await refreshTokenRepository.revokeAllForUser(userId);
  },

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

    /** Record a login failure and throw the corresponding error */
    const failLogin = async (
      reason: string,
      errorCode: (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES],
      errorMessage: string,
      statusCode?: number,
      userId?: string
    ): Promise<never> => {
      await loginLogRepository.recordFailure(
        email,
        'password',
        reason,
        ipAddress,
        userAgent,
        userId
      );
      throw new AuthError(errorCode, errorMessage, statusCode);
    };

    if (!user || !user.password) {
      return failLogin(
        'Invalid credentials',
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid email or password'
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return failLogin(
        'Invalid password',
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid email or password',
        undefined,
        user.id
      );
    }

    // Check user status
    if (user.status === 'banned') {
      return failLogin(
        'Account banned',
        AUTH_ERROR_CODES.USER_BANNED,
        'Your account has been banned',
        403,
        user.id
      );
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

    return buildAuthResponse(user, ipAddress, deviceInfo ?? parseDeviceInfo(userAgent));
  },

  /**
   * Refresh authentication tokens
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
