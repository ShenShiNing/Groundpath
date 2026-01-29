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

// GitHub OAuth configuration
const getGitHubConfig = () => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('GitHub OAuth not configured. Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET');
    throw new AuthError(
      AUTH_ERROR_CODES.OAUTH_FAILED,
      'GitHub OAuth is not configured on this server',
      500
    );
  }

  return {
    clientId,
    clientSecret,
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  };
};

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
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
 * GitHub OAuth service
 */
export const githubOAuthService = {
  /**
   * Generate GitHub authorization URL with state parameter
   */
  generateAuthUrl(returnUrl: string = '/'): string {
    const config = getGitHubConfig();
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
      scope: 'read:user user:email',
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
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
  async exchangeCodeForToken(code: string): Promise<string> {
    const config = getGitHubConfig();

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
      }),
    });

    if (!response.ok) {
      throw new AuthError(
        AUTH_ERROR_CODES.OAUTH_FAILED,
        'Unable to connect to GitHub. Please try again.',
        400
      );
    }

    const data = (await response.json()) as GitHubTokenResponse & { error?: string };
    if (data.error) {
      throw new AuthError(
        AUTH_ERROR_CODES.OAUTH_FAILED,
        'GitHub authorization failed. Please try again.',
        400
      );
    }

    return data.access_token;
  },

  /**
   * Get GitHub user profile
   */
  async getGitHubUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new AuthError(
        AUTH_ERROR_CODES.OAUTH_FAILED,
        'Unable to retrieve your GitHub profile. Please try again.',
        400
      );
    }

    return response.json() as Promise<GitHubUser>;
  },

  /**
   * Get GitHub user's primary verified email
   */
  async getGitHubPrimaryEmail(accessToken: string): Promise<string | null> {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const emails = (await response.json()) as GitHubEmail[];
    const primaryEmail = emails.find((e) => e.primary && e.verified);
    return primaryEmail?.email ?? null;
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
    const accessToken = await this.exchangeCodeForToken(code);

    // Get GitHub user info
    const githubUser = await this.getGitHubUser(accessToken);
    const email = githubUser.email || (await this.getGitHubPrimaryEmail(accessToken));

    if (!email) {
      throw new AuthError(
        AUTH_ERROR_CODES.OAUTH_FAILED,
        'No verified email found on your GitHub account. Please add and verify an email address in your GitHub settings.',
        400
      );
    }

    // Find or create user
    const user = await this.findOrCreateUser(githubUser, email, accessToken);

    // Record login
    await loginLogRepository.recordSuccess(user.id, email, 'github', ipAddress, userAgent);

    // Update last login
    await userRepository.updateLastLogin(user.id, ipAddress);

    // Generate auth response
    const deviceInfo = parseDeviceInfo(userAgent);
    const authResponse = await buildAuthResponse(user, ipAddress, deviceInfo);

    return { authResponse, returnUrl: stateData.returnUrl };
  },

  /**
   * Find existing user or create new one for GitHub OAuth
   */
  async findOrCreateUser(
    githubUser: GitHubUser,
    email: string,
    accessToken: string
  ): Promise<User> {
    const githubId = String(githubUser.id);

    // Check if GitHub account is already linked
    const existingAuth = await userAuthRepository.findByAuthTypeAndId('github', githubId);

    if (existingAuth) {
      // Update OAuth token
      await userAuthRepository.updateAuthData(existingAuth.id, {
        accessToken,
        profile: {
          login: githubUser.login,
          name: githubUser.name,
          avatar_url: githubUser.avatar_url,
        },
      });

      // Return existing user
      const user = await userRepository.findById(existingAuth.userId);
      if (!user) {
        throw new AuthError(AUTH_ERROR_CODES.USER_NOT_FOUND, 'User not found', 404);
      }
      return user;
    }

    // Check if email exists - link GitHub to existing account
    const existingUser = await userRepository.findByEmail(email.toLowerCase().trim());

    if (existingUser) {
      // Link GitHub to existing user
      await userAuthRepository.create({
        id: uuidv4(),
        userId: existingUser.id,
        authType: 'github',
        authId: githubId,
        authData: {
          accessToken,
          profile: {
            login: githubUser.login,
            name: githubUser.name,
            avatar_url: githubUser.avatar_url,
          },
        },
      });

      return existingUser;
    }

    // Create new user (without password)
    const userId = uuidv4();
    const username = await this.generateUniqueUsername(githubUser.login);

    const newUser = await userRepository.create({
      id: userId,
      username,
      email: email.toLowerCase().trim(),
      password: null, // OAuth users have no password
      avatarUrl: githubUser.avatar_url,
      status: 'active',
      emailVerified: true, // GitHub email is verified
    });

    // Create auth record
    await userAuthRepository.create({
      id: uuidv4(),
      userId: newUser.id,
      authType: 'github',
      authId: githubId,
      authData: {
        accessToken,
        profile: {
          login: githubUser.login,
          name: githubUser.name,
          avatar_url: githubUser.avatar_url,
        },
      },
    });

    return newUser;
  },

  /**
   * Generate a unique username based on GitHub login
   */
  async generateUniqueUsername(baseUsername: string): Promise<string> {
    let username = baseUsername;
    let suffix = 0;

    while (await userRepository.existsByUsername(username)) {
      suffix++;
      username = `${baseUsername}${suffix}`;
    }

    return username;
  },
};
