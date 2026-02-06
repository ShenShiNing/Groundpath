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
import type { AccessTokenPayload } from '@shared/types';
import { toUserPublicInfo, normalizeEmail, verifyRefreshToken } from '@shared/utils';
import { Errors } from '@shared/errors';
import { authConfig } from '@config/env';
import { userService } from '../../user';
import { loginLogRepository } from '../repositories/login-log.repository';
import { tokenService } from './token.service';
import { emailVerificationService } from '../verification/email-verification.service';
import { checkAccountRateLimit, resetAccountRateLimit } from '@shared/middleware';
import { detectDevice } from '../../logs/services/device-detection.service';
import { getGeoLocationAsync } from '../../logs/services/geo-location.service';
import { createLogger } from '@shared/logger';
import { sessionService } from './session.service';
import { passwordService } from './password.service';

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
    const { username, password, deviceInfo } = data;
    const email = normalizeEmail(data.email);

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
    const hashedPassword = await bcrypt.hash(password, authConfig.bcrypt.saltRounds);

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
   * Authenticate user with email and password
   */
  async login(
    credentials: LoginRequest,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<AuthResponse> {
    const { password, deviceInfo } = credentials;
    const email = normalizeEmail(credentials.email);

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
   * Register a new user with a verified email (code-based flow)
   */
  async registerWithCode(
    data: RegisterWithCodeRequest,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<AuthResponse> {
    const { username, password, verificationToken, deviceInfo } = data;
    const email = normalizeEmail(data.email);

    // Verify the verification token
    const { email: verifiedEmail } = emailVerificationService.verifyToken(
      verificationToken,
      'register'
    );

    // Ensure the email matches (verifiedEmail is already normalized in token)
    if (verifiedEmail !== email) {
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
    const hashedPassword = await bcrypt.hash(password, authConfig.bcrypt.saltRounds);

    // Create user with email verified
    const userId = uuidv4();
    const user = await userService.create({
      id: userId,
      username,
      email,
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
   * Get current user info
   */
  async getCurrentUser(userId: string): Promise<UserPublicInfo> {
    const user = await userService.findById(userId);
    if (!user) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
    }
    return toUserPublicInfo(user);
  },

  // ==================== Session Operations (delegated) ====================

  /**
   * Logout current device (revoke current refresh token)
   */
  logout(
    tokenId: string,
    userId?: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    return sessionService.logout(tokenId, userId, ipAddress, userAgent);
  },

  /**
   * Logout all devices (revoke all refresh tokens)
   */
  logoutAll(userId: string, ipAddress?: string | null, userAgent?: string | null): Promise<number> {
    return sessionService.logoutAll(userId, ipAddress, userAgent);
  },

  /**
   * Get active sessions for current user
   */
  getSessions(userId: string, currentTokenId?: string) {
    return sessionService.getSessions(userId, currentTokenId);
  },

  /**
   * Revoke a specific session
   */
  revokeSession(
    userId: string,
    sessionId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    return sessionService.revokeSession(userId, sessionId, ipAddress, userAgent);
  },

  // ==================== Password Operations (delegated) ====================

  /**
   * Change user password
   */
  changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    return passwordService.changePassword(userId, oldPassword, newPassword, ipAddress, userAgent);
  },

  /**
   * Reset user password with verified email
   */
  resetPassword(
    data: ResetPasswordRequest
  ): Promise<{ message: string; sessionsRevoked?: number }> {
    return passwordService.resetPassword(data);
  },
};

// Re-export sub-services for direct access
export { sessionService } from './session.service';
export { passwordService } from './password.service';
