import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@groundpath/shared';
import { parseDeviceInfo } from '@groundpath/shared/utils';
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  UserPublicInfo,
  DeviceInfo,
  RegisterWithCodeRequest,
} from '@groundpath/shared/types';
import type { User } from '@core/db/schema/user/users.schema';
import { toUserPublicInfo, normalizeEmail, buildAccessTokenSubject } from '@core/utils';
import { Errors } from '@core/errors';
import { authConfig } from '@config/env';
import { userService } from '@modules/user/public/management';
import { loginLogRepository } from '../repositories/login-log.repository';
import { tokenService } from './token.service';
import { emailVerificationService } from '../verification/email-verification.service';
import { checkAccountRateLimit, resetAccountRateLimit } from '@core/middleware';
import { detectDevice, getGeoLocationAsync } from '@modules/logs/public/auth-enrichment';
import { createLogger } from '@core/logger';
import { fingerprintIpAddress } from '@core/logger/redaction';

const logger = createLogger('auth.service');

/**
 * Build access token payload and generate auth response with token pair.
 */
async function buildAuthResponse(
  user: User,
  ipAddress: string | null,
  deviceInfo: DeviceInfo | null
): Promise<AuthResponse> {
  const tokens = await tokenService.generateTokenPair(
    buildAccessTokenSubject(user),
    ipAddress,
    deviceInfo
  );

  return {
    user: toUserPublicInfo(user),
    tokens,
  };
}

/**
 * Resolve device info: use provided value or parse from user agent.
 */
function resolveDeviceInfo(
  deviceInfo: DeviceInfo | undefined | null,
  userAgent: string | null
): DeviceInfo | null {
  return deviceInfo ?? parseDeviceInfo(userAgent);
}

/**
 * Get enhanced login info (device detection + geo-location)
 */
async function getEnhancedLoginInfo(ipAddress: string | null, userAgent: string | null) {
  const [geoInfo] = await Promise.all([getGeoLocationAsync(ipAddress)]);
  const deviceInfo = detectDevice(userAgent);

  logger.info(
    {
      ipFingerprint: fingerprintIpAddress(ipAddress),
      deviceType: deviceInfo?.deviceType ?? null,
      browser: deviceInfo?.browser ?? null,
      os: deviceInfo?.os ?? null,
      country: geoInfo?.country ?? null,
    },
    'Enhanced login info resolved'
  );

  return { deviceInfo, geoInfo };
}

/**
 * Validate that email and username are not already taken.
 */
async function validateNewUser(email: string, username: string): Promise<void> {
  const emailExists = await userService.existsByEmail(email);
  if (emailExists) {
    throw Errors.auth(
      AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
      'An account with this email already exists',
      400
    );
  }

  const usernameExists = await userService.existsByUsername(username);
  if (usernameExists) {
    throw Errors.auth(
      AUTH_ERROR_CODES.USERNAME_ALREADY_EXISTS,
      'This username is already taken',
      400
    );
  }
}

/**
 * Record successful login/registration and build auth response.
 */
async function recordSuccessAndBuildResponse(
  user: User,
  email: string,
  ipAddress: string | null,
  userAgent: string | null,
  deviceInfo: DeviceInfo | null
): Promise<AuthResponse> {
  const enhanced = await getEnhancedLoginInfo(ipAddress, userAgent);
  await loginLogRepository.recordSuccess(
    user.id,
    email,
    'password',
    ipAddress,
    userAgent,
    enhanced
  );
  await userService.updateLastLogin(user.id, ipAddress);
  return buildAuthResponse(user, ipAddress, deviceInfo);
}

/**
 * Record a login failure and throw the corresponding error.
 */
async function recordFailureAndThrow(
  email: string,
  ipAddress: string | null,
  userAgent: string | null,
  enhancedPromise: Promise<{
    deviceInfo: ReturnType<typeof detectDevice>;
    geoInfo: Awaited<ReturnType<typeof getGeoLocationAsync>>;
  }>,
  reason: string,
  errorCode: (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES],
  errorMessage: string,
  statusCode?: number,
  userId?: string
): Promise<never> {
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

    await validateNewUser(email, username);

    const hashedPassword = await bcrypt.hash(password, authConfig.bcrypt.saltRounds);
    const user = await userService.create({
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      status: 'active',
    });

    return recordSuccessAndBuildResponse(
      user,
      email,
      ipAddress,
      userAgent,
      resolveDeviceInfo(deviceInfo, userAgent)
    );
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
    const rateCheck = await checkAccountRateLimit(email);
    if (!rateCheck.allowed) {
      const minutes = Math.ceil((rateCheck.retryAfter ?? 0) / 60);
      throw Errors.auth(
        AUTH_ERROR_CODES.RATE_LIMITED,
        `Too many failed login attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        429
      );
    }

    // Get enhanced login info (non-blocking for failures, awaited for success)
    const enhancedPromise = getEnhancedLoginInfo(ipAddress, userAgent);

    const user = await userService.findByEmail(email);

    if (!user || !user.password) {
      return recordFailureAndThrow(
        email,
        ipAddress,
        userAgent,
        enhancedPromise,
        'Invalid credentials',
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid email or password'
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return recordFailureAndThrow(
        email,
        ipAddress,
        userAgent,
        enhancedPromise,
        'Invalid password',
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid email or password',
        undefined,
        user.id
      );
    }

    if (user.status === 'banned') {
      return recordFailureAndThrow(
        email,
        ipAddress,
        userAgent,
        enhancedPromise,
        'Account banned',
        AUTH_ERROR_CODES.USER_BANNED,
        'Your account has been banned',
        403,
        user.id
      );
    }

    const enhanced = await enhancedPromise;
    await loginLogRepository.recordSuccess(
      user.id,
      email,
      'password',
      ipAddress,
      userAgent,
      enhanced
    );
    await resetAccountRateLimit(email);
    await userService.updateLastLogin(user.id, ipAddress);

    return buildAuthResponse(user, ipAddress, resolveDeviceInfo(deviceInfo, userAgent));
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
    const refreshed = await tokenService.refreshTokens(refreshToken, ipAddress, deviceInfo);
    const user = await userService.findById(refreshed.userId);

    if (!user) {
      throw Errors.auth(AUTH_ERROR_CODES.TOKEN_INVALID, 'User not found');
    }

    return {
      user: toUserPublicInfo(user),
      tokens: refreshed.tokens,
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

    const { email: verifiedEmail } = emailVerificationService.verifyToken(
      verificationToken,
      'register'
    );

    if (verifiedEmail !== email) {
      throw Errors.auth(
        AUTH_ERROR_CODES.TOKEN_INVALID,
        'Verification token does not match the provided email',
        400
      );
    }

    await validateNewUser(email, username);

    const hashedPassword = await bcrypt.hash(password, authConfig.bcrypt.saltRounds);
    const user = await userService.create({
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      status: 'active',
      emailVerified: true,
    });

    return recordSuccessAndBuildResponse(
      user,
      email,
      ipAddress,
      userAgent,
      resolveDeviceInfo(deviceInfo, userAgent)
    );
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
};
