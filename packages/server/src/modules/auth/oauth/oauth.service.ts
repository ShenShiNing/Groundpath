import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@groundpath/shared';
import { parseDeviceInfo } from '@groundpath/shared/utils';
import type { AuthResponse, DeviceInfo } from '@groundpath/shared/types';
import type { User } from '@core/db/schema/user/users.schema';
import { withTransaction, type Transaction } from '@core/db/db.utils';
import type { AccessTokenSubject } from '@core/types';
import {
  generateOAuthStateToken,
  normalizeEmail,
  toUserPublicInfo,
  verifyOAuthStateToken,
} from '@core/utils';
import { Errors } from '@core/errors';
import { userService } from '@modules/user/public/management';
import { userAuthRepository } from '../repositories/user-auth.repository';
import { loginLogRepository } from '../repositories/login-log.repository';
import { tokenService } from '../services/token.service';
import { oauthExchangeCodeRepository } from '../repositories/oauth-exchange-code.repository';
import type { OAuthExchangeCodeContext } from '../repositories/oauth-exchange-code.repository';
import type { OAuthProviderType, OAuthUserData } from './oauth.types';
import { detectDevice, getGeoLocationAsync } from '@modules/logs/public/auth-enrichment';
import { createLogger } from '@core/logger';
import { fingerprintIpAddress } from '@core/logger/redaction';

const logger = createLogger('oauth.service');
const OAUTH_USERNAME_RETRY_LIMIT = 20;

class RetryWithExistingOAuthBindingError extends Error {
  constructor() {
    super('OAuth binding already exists; retry with the persisted binding');
    this.name = 'RetryWithExistingOAuthBindingError';
  }
}

function isDuplicateEntryError(error: unknown): error is { code?: string; errno?: number } {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const duplicateError = error as { code?: string; errno?: number };
  return duplicateError.code === 'ER_DUP_ENTRY' || duplicateError.errno === 1062;
}

async function getOAuthUserByIdOrThrow(userId: string, tx: Transaction): Promise<User> {
  const user = await userService.findById(userId, tx);

  if (!user) {
    throw Errors.auth(AUTH_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
  }

  return user;
}

async function syncExistingOAuthBinding(
  authId: string,
  userId: string,
  authData: {
    accessToken: string;
    profile: Record<string, unknown>;
  },
  tx: Transaction
): Promise<User> {
  await userAuthRepository.updateAuthData(authId, authData, tx);
  return getOAuthUserByIdOrThrow(userId, tx);
}

async function findOrCreateOAuthAccountUser(
  userData: OAuthUserData,
  tx: Transaction
): Promise<{ user: User; createdNewUser: boolean }> {
  const normalizedEmail = normalizeEmail(userData.email);
  const existingUser = await userService.findByEmail(normalizedEmail, tx);

  if (existingUser) {
    return {
      user: existingUser,
      createdNewUser: false,
    };
  }

  for (let attempt = 0; attempt < OAUTH_USERNAME_RETRY_LIMIT; attempt++) {
    const uniqueUsername = await generateUniqueUsername(userData.username, tx);

    try {
      const newUser = await userService.create(
        {
          id: uuidv4(),
          username: uniqueUsername,
          email: normalizedEmail,
          password: null,
          avatarUrl: userData.avatarUrl,
          status: 'active',
          emailVerified: true,
        },
        tx
      );

      return {
        user: newUser,
        createdNewUser: true,
      };
    } catch (error) {
      if (!isDuplicateEntryError(error)) {
        throw error;
      }

      const conflictedUser = await userService.findByEmail(normalizedEmail, tx);
      if (conflictedUser) {
        return {
          user: conflictedUser,
          createdNewUser: false,
        };
      }
    }
  }

  throw Errors.internal('Failed to allocate a unique username for OAuth user');
}

async function createOrReuseOAuthBinding(
  user: User,
  createdNewUser: boolean,
  userData: OAuthUserData,
  tx: Transaction
): Promise<User> {
  try {
    await userAuthRepository.create(
      {
        id: uuidv4(),
        userId: user.id,
        authType: userData.providerType,
        authId: userData.providerId,
        authData: {
          accessToken: userData.accessToken,
          profile: userData.profile,
        },
      },
      tx
    );

    return user;
  } catch (error) {
    if (!isDuplicateEntryError(error)) {
      throw error;
    }

    const existingAuth = await userAuthRepository.findByAuthTypeAndId(
      userData.providerType,
      userData.providerId,
      tx
    );

    if (!existingAuth) {
      throw error;
    }

    if (createdNewUser && existingAuth.userId !== user.id) {
      throw new RetryWithExistingOAuthBindingError();
    }

    await userAuthRepository.updateAuthData(
      existingAuth.id,
      {
        accessToken: userData.accessToken,
        profile: userData.profile,
      },
      tx
    );

    if (existingAuth.userId === user.id) {
      return user;
    }

    return getOAuthUserByIdOrThrow(existingAuth.userId, tx);
  }
}

// ==================== State Store ====================

/**
 * Generate a signed state token (stateless, multi-instance safe)
 */
export function generateState(returnUrl: string = '/'): string {
  return generateOAuthStateToken(returnUrl, '5m');
}

/**
 * Validate state parameter and return stored data
 */
export function validateState(state: string): { returnUrl: string } | null {
  try {
    const decoded = verifyOAuthStateToken(state);
    if (decoded.purpose !== 'oauth_state' || typeof decoded.returnUrl !== 'string') {
      return null;
    }
    return { returnUrl: decoded.returnUrl };
  } catch {
    return null;
  }
}

/**
 * Generate one-time exchange code for frontend callback.
 * The frontend exchanges this code for auth payload via API.
 */
export async function createOAuthExchangeCode(userId: string, returnUrl: string): Promise<string> {
  const code = uuidv4();
  await oauthExchangeCodeRepository.create(code, userId, returnUrl, 60);
  return code;
}

/**
 * Consume one-time OAuth exchange code.
 */
export function consumeOAuthExchangeCode(
  code: string,
  userId: string
): Promise<OAuthExchangeCodeContext | null> {
  return oauthExchangeCodeRepository.consume(code, userId);
}

// ==================== Auth Response ====================

/**
 * Build auth response with JWT tokens for OAuth login
 */
export async function buildAuthResponse(
  user: User,
  ipAddress: string | null,
  deviceInfo: DeviceInfo | null
): Promise<AuthResponse> {
  const accessPayload: AccessTokenSubject = {
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

// ==================== User Management ====================

/**
 * Find existing user or create new one for OAuth
 */
export async function findOrCreateOAuthUser(userData: OAuthUserData): Promise<User> {
  try {
    return await withTransaction(async (tx) => {
      const existingAuth = await userAuthRepository.findByAuthTypeAndId(
        userData.providerType,
        userData.providerId,
        tx
      );

      if (existingAuth) {
        return syncExistingOAuthBinding(
          existingAuth.id,
          existingAuth.userId,
          {
            accessToken: userData.accessToken,
            profile: userData.profile,
          },
          tx
        );
      }

      const { user, createdNewUser } = await findOrCreateOAuthAccountUser(userData, tx);
      return createOrReuseOAuthBinding(user, createdNewUser, userData, tx);
    });
  } catch (error) {
    if (!(error instanceof RetryWithExistingOAuthBindingError)) {
      throw error;
    }
  }

  return withTransaction(async (tx) => {
    const existingAuth = await userAuthRepository.findByAuthTypeAndId(
      userData.providerType,
      userData.providerId,
      tx
    );

    if (!existingAuth) {
      throw Errors.internal('OAuth binding could not be resolved after concurrent create');
    }

    return syncExistingOAuthBinding(
      existingAuth.id,
      existingAuth.userId,
      {
        accessToken: userData.accessToken,
        profile: userData.profile,
      },
      tx
    );
  });
}

/**
 * Generate a unique username based on base name
 */
export async function generateUniqueUsername(baseName: string, tx?: Transaction): Promise<string> {
  // Sanitize the name: remove special characters, replace spaces with underscores
  let baseUsername = baseName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 20);

  // Ensure it's not empty
  if (!baseUsername) {
    baseUsername = 'user';
  }

  let username = baseUsername;
  let suffix = 0;

  while (await userService.existsByUsername(username, tx)) {
    suffix++;
    username = `${baseUsername}${suffix}`;
  }

  return username;
}

// ==================== Login Recording ====================

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
    'OAuth enhanced login info resolved'
  );

  return {
    deviceInfo,
    geoInfo,
  };
}

/**
 * Record successful OAuth login
 */
export async function recordOAuthLogin(
  user: User,
  email: string,
  providerType: OAuthProviderType,
  ipAddress: string | null,
  userAgent: string | null
): Promise<AuthResponse> {
  // Get enhanced login info
  const enhanced = await getEnhancedLoginInfo(ipAddress, userAgent);

  // Record login with enhanced info
  await loginLogRepository.recordSuccess(
    user.id,
    email,
    providerType,
    ipAddress,
    userAgent,
    enhanced
  );

  // Update last login
  await userService.updateLastLogin(user.id, ipAddress);

  // Generate auth response
  const deviceInfo = parseDeviceInfo(userAgent);
  return buildAuthResponse(user, ipAddress, deviceInfo);
}
