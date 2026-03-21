import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { parseDeviceInfo } from '@knowledge-agent/shared/utils';
import type { AuthResponse, DeviceInfo } from '@knowledge-agent/shared/types';
import type { User } from '@core/db/schema/user/users.schema';
import type { AccessTokenSubject } from '@core/types';
import { generateOAuthStateToken, toUserPublicInfo, verifyOAuthStateToken } from '@core/utils';
import { Errors } from '@core/errors';
import { userService } from '../../user';
import { userAuthRepository } from '../repositories/user-auth.repository';
import { loginLogRepository } from '../repositories/login-log.repository';
import { tokenService } from '../services/token.service';
import { oauthExchangeCodeRepository } from '../repositories/oauth-exchange-code.repository';
import type { OAuthExchangeCodeContext } from '../repositories/oauth-exchange-code.repository';
import type { OAuthProviderType, OAuthUserData } from './oauth.types';
import { detectDevice, getGeoLocationAsync } from '@modules/logs/public/auth-enrichment';
import { createLogger } from '@core/logger';

const logger = createLogger('oauth.service');

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
  const { providerType, providerId, email, username, avatarUrl, accessToken, profile } = userData;

  // Check if OAuth account is already linked
  const existingAuth = await userAuthRepository.findByAuthTypeAndId(providerType, providerId);

  if (existingAuth) {
    // Update OAuth token and profile
    await userAuthRepository.updateAuthData(existingAuth.id, {
      accessToken,
      profile,
    });

    // Return existing user
    const user = await userService.findById(existingAuth.userId);
    if (!user) {
      throw Errors.auth(AUTH_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
    }
    return user;
  }

  // Check if email exists - link OAuth to existing account
  const existingUser = await userService.findByEmail(email.toLowerCase().trim());

  if (existingUser) {
    // Link OAuth to existing user
    await userAuthRepository.create({
      id: uuidv4(),
      userId: existingUser.id,
      authType: providerType,
      authId: providerId,
      authData: {
        accessToken,
        profile,
      },
    });

    return existingUser;
  }

  // Create new user (without password)
  const userId = uuidv4();
  const uniqueUsername = await generateUniqueUsername(username);

  const newUser = await userService.create({
    id: userId,
    username: uniqueUsername,
    email: email.toLowerCase().trim(),
    password: null, // OAuth users have no password
    avatarUrl,
    status: 'active',
    emailVerified: true, // OAuth email is verified
  });

  // Create auth record
  await userAuthRepository.create({
    id: uuidv4(),
    userId: newUser.id,
    authType: providerType,
    authId: providerId,
    authData: {
      accessToken,
      profile,
    },
  });

  return newUser;
}

/**
 * Generate a unique username based on base name
 */
export async function generateUniqueUsername(baseName: string): Promise<string> {
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

  while (await userService.existsByUsername(username)) {
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

  logger.info({ ipAddress, userAgent, deviceInfo, geoInfo }, 'OAuth enhanced login info');

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
