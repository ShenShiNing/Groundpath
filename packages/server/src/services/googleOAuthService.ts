import { v4 as uuidv4 } from 'uuid';
import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { parseDeviceInfo } from '@knowledge-agent/shared/utils';
import type { AuthResponse, DeviceInfo } from '@knowledge-agent/shared/types';
import type { User } from '../db/schema/user/users';
import type { AccessTokenPayload } from '../types/authTypes';
import { toUserPublicInfo } from '../types/authTypes';
import { AuthError } from '../utils/errors';
import { userRepository } from '../repositories/userRepository';
import { userAuthRepository } from '../repositories/userAuthRepository';
import { loginLogRepository } from '../repositories/loginLogRepository';
import { tokenService } from './tokenService';

// In-memory state store (for production, use Redis)
const stateStore = new Map<string, { returnUrl: string; expiresAt: number }>();

// Google OAuth configuration
const getGoogleConfig = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Google OAuth not configured. Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    throw new AuthError(
      AUTH_ERROR_CODES.OAUTH_FAILED,
      'Google OAuth is not configured on this server',
      500
    );
  }

  return {
    clientId,
    clientSecret,
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  };
};

interface GoogleUser {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
  id_token?: string;
}

/**
 * Build auth response with JWT tokens for OAuth login
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
 * Google OAuth service
 */
export const googleOAuthService = {
  /**
   * Generate Google authorization URL with state parameter
   */
  generateAuthUrl(returnUrl: string = '/'): string {
    const config = getGoogleConfig();
    const state = uuidv4();

    // Store state with expiration (5 minutes)
    stateStore.set(state, {
      returnUrl,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // Clean up expired states
    for (const [key, value] of stateStore.entries()) {
      if (value.expiresAt < Date.now()) {
        stateStore.delete(key);
      }
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  /**
   * Validate state parameter and return stored data
   */
  validateState(state: string): { returnUrl: string } | null {
    const stored = stateStore.get(state);
    if (!stored || stored.expiresAt < Date.now()) {
      stateStore.delete(state);
      return null;
    }

    stateStore.delete(state);
    return { returnUrl: stored.returnUrl };
  },

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
    const config = getGoogleConfig();

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.callbackUrl,
      }),
    });

    if (!response.ok) {
      throw new AuthError(
        AUTH_ERROR_CODES.OAUTH_FAILED,
        'Unable to connect to Google. Please try again.',
        400
      );
    }

    const data = (await response.json()) as GoogleTokenResponse & { error?: string };
    if (data.error) {
      throw new AuthError(
        AUTH_ERROR_CODES.OAUTH_FAILED,
        'Google authorization failed. Please try again.',
        400
      );
    }

    return data;
  },

  /**
   * Get Google user profile
   */
  async getGoogleUser(accessToken: string): Promise<GoogleUser> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new AuthError(
        AUTH_ERROR_CODES.OAUTH_FAILED,
        'Unable to retrieve your Google profile. Please try again.',
        400
      );
    }

    return response.json() as Promise<GoogleUser>;
  },

  /**
   * Handle OAuth callback - main entry point
   */
  async handleCallback(
    code: string,
    state: string,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<{ authResponse: AuthResponse; returnUrl: string }> {
    // Validate state
    const stateData = this.validateState(state);
    if (!stateData) {
      throw new AuthError(
        AUTH_ERROR_CODES.TOKEN_INVALID,
        'Login session expired. Please try again.',
        400
      );
    }

    // Exchange code for token
    const tokenData = await this.exchangeCodeForToken(code);

    // Get Google user info
    const googleUser = await this.getGoogleUser(tokenData.access_token);

    if (!googleUser.email || !googleUser.verified_email) {
      throw new AuthError(
        AUTH_ERROR_CODES.OAUTH_FAILED,
        'No verified email found on your Google account. Please verify your email address in your Google settings.',
        400
      );
    }

    // Find or create user
    const user = await this.findOrCreateUser(googleUser, tokenData.access_token);

    // Record login
    await loginLogRepository.recordSuccess(
      user.id,
      googleUser.email,
      'google',
      ipAddress,
      userAgent
    );

    // Update last login
    await userRepository.updateLastLogin(user.id, ipAddress);

    // Generate auth response
    const deviceInfo = parseDeviceInfo(userAgent);
    const authResponse = await buildAuthResponse(user, ipAddress, deviceInfo);

    return { authResponse, returnUrl: stateData.returnUrl };
  },

  /**
   * Find existing user or create new one for Google OAuth
   */
  async findOrCreateUser(googleUser: GoogleUser, accessToken: string): Promise<User> {
    const googleId = googleUser.id;

    // Check if Google account is already linked
    const existingAuth = await userAuthRepository.findByAuthTypeAndId('google', googleId);

    if (existingAuth) {
      // Update OAuth token
      await userAuthRepository.updateAuthData(existingAuth.id, {
        accessToken,
        profile: {
          name: googleUser.name,
          given_name: googleUser.given_name,
          family_name: googleUser.family_name,
          picture: googleUser.picture,
        },
      });

      // Return existing user
      const user = await userRepository.findById(existingAuth.userId);
      if (!user) {
        throw new AuthError(AUTH_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
      }
      return user;
    }

    // Check if email exists - link Google to existing account
    const existingUser = await userRepository.findByEmail(googleUser.email.toLowerCase().trim());

    if (existingUser) {
      // Link Google to existing user
      await userAuthRepository.create({
        id: uuidv4(),
        userId: existingUser.id,
        authType: 'google',
        authId: googleId,
        authData: {
          accessToken,
          profile: {
            name: googleUser.name,
            given_name: googleUser.given_name,
            family_name: googleUser.family_name,
            picture: googleUser.picture,
          },
        },
      });

      return existingUser;
    }

    // Create new user (without password)
    const userId = uuidv4();
    const username = await this.generateUniqueUsername(googleUser.name || googleUser.email);

    const newUser = await userRepository.create({
      id: userId,
      username,
      email: googleUser.email.toLowerCase().trim(),
      password: null, // OAuth users have no password
      avatarUrl: googleUser.picture || null,
      status: 'active',
      emailVerified: true, // Google email is verified
    });

    // Create auth record
    await userAuthRepository.create({
      id: uuidv4(),
      userId: newUser.id,
      authType: 'google',
      authId: googleId,
      authData: {
        accessToken,
        profile: {
          name: googleUser.name,
          given_name: googleUser.given_name,
          family_name: googleUser.family_name,
          picture: googleUser.picture,
        },
      },
    });

    return newUser;
  },

  /**
   * Generate a unique username based on Google name
   */
  async generateUniqueUsername(baseName: string): Promise<string> {
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

    while (await userRepository.existsByUsername(username)) {
      suffix++;
      username = `${baseUsername}${suffix}`;
    }

    return username;
  },
};
