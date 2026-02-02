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
  RegisterWithCodeRequest,
  ResetPasswordRequest,
} from '@knowledge-agent/shared/types';
import type { User } from '@shared/db/schema/user/users.schema';
import type { AccessTokenPayload } from '../types/auth.types';
import { toUserPublicInfo } from '@shared/utils/user.mappers';
import { Errors } from '@shared/errors';
import { verifyRefreshToken } from '@shared/utils/jwt.utils';
import { withTransaction } from '@shared/db/db.utils';
import { userService } from '../../user';
import { loginLogRepository } from '../repositories/login-log.repository';
import { refreshTokenRepository } from '../repositories/refresh-token.repository';
import { tokenService } from './token.service';
import { emailVerificationService } from '../verification/email-verification.service';
import {
  checkAccountRateLimit,
  resetAccountRateLimit,
} from '@shared/middleware/rate-limit.middleware';
import { detectDevice } from '../../logs/services/device-detection.service';
import { getGeoLocationAsync } from '../../logs/services/geo-location.service';
import { logOperation } from '@shared/logger/operation-logger';
import { createLogger } from '@shared/logger';

const logger = createLogger('auth.service');

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
 * Get enhanced login info (device detection + geo-location)
 * This runs asynchronously and does not block the main flow
 */
async function getEnhancedLoginInfo(ipAddress: string | null, userAgent: string | null) {
  const [geoInfo] = await Promise.all([getGeoLocationAsync(ipAddress)]);
  const deviceInfo = detectDevice(userAgent);

  logger.info({ ipAddress, userAgent, deviceInfo, geoInfo }, 'Enhanced login info');

  return {
    deviceInfo,
    geoInfo,
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
    const emailExists = await userService.existsByEmail(email);
    if (emailExists) {
      throw Errors.auth(
        AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
        'An account with this email already exists',
        400
      );
    }

    // Check if username already exists
    const usernameExists = await userService.existsByUsername(username);
    if (usernameExists) {
      throw Errors.auth(
        AUTH_ERROR_CODES.USERNAME_ALREADY_EXISTS,
        'This username is already taken',
        400
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const userId = uuidv4();
    const user = await userService.create({
      id: userId,
      username,
      email,
      password: hashedPassword,
      status: 'active',
    });

    // Get enhanced login info asynchronously
    const enhanced = await getEnhancedLoginInfo(ipAddress, userAgent);

    // Record successful registration in login logs
    await loginLogRepository.recordSuccess(
      user.id,
      email,
      'password',
      ipAddress,
      userAgent,
      enhanced
    );

    // Update last login info
    await userService.updateLastLogin(user.id, ipAddress);

    return buildAuthResponse(user, ipAddress, deviceInfo ?? parseDeviceInfo(userAgent));
  },

  /**
   * Change user password
   * Wrapped in a transaction to ensure password update and token revocation are atomic
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const startTime = Date.now();

    // Find user (outside transaction - read-only)
    const user = await userService.findById(userId);
    if (!user || !user.password) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
    }

    // Verify old password (outside transaction - no DB writes)
    const isValidPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidPassword) {
      throw Errors.auth(AUTH_ERROR_CODES.INVALID_PASSWORD, 'Current password is incorrect', 400);
    }

    // Hash new password (outside transaction - no DB writes)
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Transaction: update password and revoke all tokens atomically
    await withTransaction(async (tx) => {
      // Update password
      await userService.updatePassword(userId, hashedPassword, tx);

      // Revoke all refresh tokens for security (force re-login on all devices)
      await refreshTokenRepository.revokeAllForUser(userId, tx);
    });

    // Log the operation (outside transaction - non-critical)
    logOperation({
      userId,
      resourceType: 'user',
      resourceId: userId,
      action: 'user.change_password',
      description: 'User changed their password',
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      durationMs: Date.now() - startTime,
    });
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
      throw Errors.auth(
        AUTH_ERROR_CODES.RATE_LIMITED,
        `Too many failed login attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        429
      );
    }

    // Get enhanced login info asynchronously (non-blocking for failures, awaited for success)
    const enhancedPromise = getEnhancedLoginInfo(ipAddress, userAgent);

    // Find user by email
    const user = await userService.findByEmail(email);

    /** Record a login failure and throw the corresponding error */
    const failLogin = async (
      reason: string,
      errorCode: (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES],
      errorMessage: string,
      statusCode?: number,
      userId?: string
    ): Promise<never> => {
      // Get enhanced info for failure logging (don't block on errors)
      const enhanced = await enhancedPromise.catch(() => ({ deviceInfo: null, geoInfo: null }));
      await loginLogRepository.recordFailure(
        email,
        'password',
        reason,
        ipAddress,
        userAgent,
        userId,
        enhanced
      );
      throw Errors.auth(errorCode, errorMessage, statusCode);
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

    // Get enhanced info for success logging
    const enhanced = await enhancedPromise;

    // Record successful login
    await loginLogRepository.recordSuccess(
      user.id,
      email,
      'password',
      ipAddress,
      userAgent,
      enhanced
    );

    // Reset account rate limit on successful login
    resetAccountRateLimit(email);

    // Update last login info
    await userService.updateLastLogin(user.id, ipAddress);

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
    const user = await userService.findById(sub);

    if (!user) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
    }

    return {
      user: toUserPublicInfo(user),
      tokens,
    };
  },

  /**
   * Logout current device (revoke current refresh token)
   */
  async logout(
    tokenId: string,
    userId?: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const startTime = Date.now();
    await tokenService.revokeToken(tokenId);

    // Log the operation if userId is provided
    if (userId) {
      logOperation({
        userId,
        resourceType: 'session',
        resourceId: tokenId,
        action: 'session.logout',
        description: 'User logged out from current session',
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        durationMs: Date.now() - startTime,
      });
    }
  },

  /**
   * Logout all devices (revoke all refresh tokens)
   */
  async logoutAll(
    userId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<number> {
    const startTime = Date.now();
    const count = await tokenService.revokeAllUserTokens(userId);

    // Log the operation
    logOperation({
      userId,
      resourceType: 'session',
      action: 'session.logout_all',
      description: `User logged out from all devices (${count} sessions revoked)`,
      metadata: { sessionsRevoked: count },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return count;
  },

  /**
   * Get current user info
   */
  async getCurrentUser(userId: string): Promise<UserPublicInfo> {
    const user = await userService.findById(userId);
    if (!user) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
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
  async revokeSession(
    userId: string,
    sessionId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const startTime = Date.now();

    // Verify the session belongs to the user by checking via token service
    const sessions = await tokenService.getUserSessions(userId);
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      throw Errors.auth(AUTH_ERROR_CODES.SESSION_NOT_FOUND, 'Session not found', 404);
    }

    await tokenService.revokeToken(sessionId);

    // Log the operation
    logOperation({
      userId,
      resourceType: 'session',
      resourceId: sessionId,
      action: 'session.revoke',
      description: 'User revoked a session',
      metadata: {
        deviceType: session.deviceInfo?.deviceType ?? null,
        browser: session.deviceInfo?.browser ?? null,
      },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      durationMs: Date.now() - startTime,
    });
  },

  /**
   * Register a new user with a verified email (code-based flow)
   */
  async registerWithCode(
    data: RegisterWithCodeRequest,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<AuthResponse> {
    const { email, username, password, verificationToken, deviceInfo } = data;

    // Verify the verification token
    const { email: verifiedEmail } = emailVerificationService.verifyToken(
      verificationToken,
      'register'
    );

    // Ensure the email matches
    if (verifiedEmail !== email.toLowerCase().trim()) {
      throw Errors.auth(
        AUTH_ERROR_CODES.TOKEN_INVALID,
        'Verification token does not match the provided email',
        400
      );
    }

    // Check if email already exists
    const emailExists = await userService.existsByEmail(email);
    if (emailExists) {
      throw Errors.auth(
        AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
        'An account with this email already exists',
        400
      );
    }

    // Check if username already exists
    const usernameExists = await userService.existsByUsername(username);
    if (usernameExists) {
      throw Errors.auth(
        AUTH_ERROR_CODES.USERNAME_ALREADY_EXISTS,
        'This username is already taken',
        400
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with email verified
    const userId = uuidv4();
    const user = await userService.create({
      id: userId,
      username,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      status: 'active',
      emailVerified: true,
    });

    // Get enhanced login info asynchronously
    const enhanced = await getEnhancedLoginInfo(ipAddress, userAgent);

    // Record successful registration
    await loginLogRepository.recordSuccess(
      user.id,
      email,
      'password',
      ipAddress,
      userAgent,
      enhanced
    );

    // Update last login info
    await userService.updateLastLogin(user.id, ipAddress);

    return buildAuthResponse(user, ipAddress, deviceInfo ?? parseDeviceInfo(userAgent));
  },

  /**
   * Reset user password with verified email
   * Wrapped in a transaction to ensure password update and token revocation are atomic
   */
  async resetPassword(
    data: ResetPasswordRequest
  ): Promise<{ message: string; sessionsRevoked?: number }> {
    const { email, newPassword, verificationToken, logoutAllDevices } = data;

    // Verify the verification token (outside transaction - no DB writes)
    const { email: verifiedEmail } = emailVerificationService.verifyToken(
      verificationToken,
      'reset_password'
    );

    // Ensure the email matches
    if (verifiedEmail !== email.toLowerCase().trim()) {
      throw Errors.auth(
        AUTH_ERROR_CODES.TOKEN_INVALID,
        'Verification token does not match the provided email',
        400
      );
    }

    // Find user (outside transaction - read-only)
    const user = await userService.findByEmail(email);
    if (!user) {
      throw Errors.auth(AUTH_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }

    // Hash new password (outside transaction - no DB writes)
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Transaction: update password and optionally revoke sessions atomically
    const sessionsRevoked = await withTransaction(async (tx) => {
      // Update password
      await userService.updatePassword(user.id, hashedPassword, tx);

      // Optionally revoke all sessions
      if (logoutAllDevices !== false) {
        return refreshTokenRepository.revokeAllForUser(user.id, tx);
      }
      return undefined;
    });

    return {
      message: 'Password reset successfully',
      sessionsRevoked,
    };
  },
};
