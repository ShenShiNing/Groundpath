import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { parseDeviceInfo } from '@knowledge-agent/shared/utils';
import type { AuthResponse, DeviceInfo } from '@knowledge-agent/shared/types';
import type { User } from '@shared/db/schema/user/users.schema';
import type { AccessTokenPayload } from '@shared/types';
import { toUserPublicInfo } from '@shared/utils';
import { Errors } from '@shared/errors';
import { userService } from '../../user';
import { userAuthRepository } from '../repositories/user-auth.repository';
import { loginLogRepository } from '../repositories/login-log.repository';
import { tokenService } from '../services/token.service';
import type { OAuthStateData, OAuthProviderType, OAuthUserData } from './oauth.types';
import { detectDevice } from '../../logs/services/device-detection.service';
import { getGeoLocationAsync } from '../../logs/services/geo-location.service';
import { createLogger } from '@shared/logger';

const logger = createLogger('oauth.service');

// ==================== State Store ====================

// In-memory state store (for production, use Redis)
const stateStore = new Map<string, OAuthStateData>();
const exchangeCodeStore = new Map<string, { authResponse: AuthResponse; expiresAt: number }>();

/**
 * Generate a state token and store it with the return URL
 */
export function generateState(returnUrl: string = '/'): string {
  const state = uuidv4();

  // Store state with expiration (5 minutes)
  stateStore.set(state, {
    returnUrl,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  // Clean up expired states
  cleanupExpiredStates();

  return state;
}

/**
 * Validate state parameter and return stored data
 */
export function validateState(state: string): { returnUrl: string } | null {
  const stored = stateStore.get(state);
  if (!stored || stored.expiresAt < Date.now()) {
    stateStore.delete(state);
    return null;
  }

  stateStore.delete(state);
  return { returnUrl: stored.returnUrl };
}

/**
 * Clean up expired state entries
 */
function cleanupExpiredStates(): void {
  const now = Date.now();
  for (const [key, value] of stateStore.entries()) {
    if (value.expiresAt < now) {
      stateStore.delete(key);
    }
  }
}

function cleanupExpiredExchangeCodes(): void {
  const now = Date.now();
  for (const [key, value] of exchangeCodeStore.entries()) {
    if (value.expiresAt < now) {
      exchangeCodeStore.delete(key);
    }
  }
}

/**
 * Generate one-time exchange code for frontend callback.
 * The frontend exchanges this code for auth payload via API.
 */
export function createOAuthExchangeCode(authResponse: AuthResponse): string {
  const code = uuidv4();
  exchangeCodeStore.set(code, {
    authResponse,
    expiresAt: Date.now() + 60 * 1000,
  });
  cleanupExpiredExchangeCodes();
  return code;
}

/**
 * Consume one-time OAuth exchange code.
 */
export function consumeOAuthExchangeCode(code: string): AuthResponse | null {
  const stored = exchangeCodeStore.get(code);
  if (!stored || stored.expiresAt < Date.now()) {
    exchangeCodeStore.delete(code);
    return null;
  }
  exchangeCodeStore.delete(code);
  return stored.authResponse;
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
