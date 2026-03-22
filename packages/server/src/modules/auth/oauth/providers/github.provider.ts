import { AUTH_ERROR_CODES } from '@groundpath/shared';
import { Errors } from '@core/errors';
import { serverConfig, oauthConfig } from '@config/env';
import type {
  OAuthProviderConfig,
  OAuthCallbackResult,
  GitHubUser,
  GitHubEmail,
  GitHubTokenResponse,
} from '../oauth.types';
import {
  generateState,
  validateState,
  findOrCreateOAuthUser,
  recordOAuthLogin,
} from '../oauth.service';

// ==================== Configuration ====================

function getGitHubConfig(): OAuthProviderConfig {
  const clientId = oauthConfig.github.clientId;
  const clientSecret = oauthConfig.github.clientSecret;

  if (!clientId || !clientSecret) {
    throw Errors.auth(
      AUTH_ERROR_CODES.OAUTH_FAILED,
      'GitHub OAuth is not configured on this server',
      500
    );
  }

  return {
    clientId,
    clientSecret,
    callbackUrl: oauthConfig.github.callbackUrl,
    frontendUrl: serverConfig.frontendUrl,
  };
}

// ==================== API Methods ====================

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code: string): Promise<string> {
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
    throw Errors.auth(
      AUTH_ERROR_CODES.OAUTH_FAILED,
      'Unable to connect to GitHub. Please try again.',
      400
    );
  }

  const data = (await response.json()) as GitHubTokenResponse;
  if (data.error) {
    throw Errors.auth(
      AUTH_ERROR_CODES.OAUTH_FAILED,
      'GitHub authorization failed. Please try again.',
      400
    );
  }

  return data.access_token;
}

/**
 * Get GitHub user profile
 */
async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw Errors.auth(
      AUTH_ERROR_CODES.OAUTH_FAILED,
      'Unable to retrieve your GitHub profile. Please try again.',
      400
    );
  }

  return response.json() as Promise<GitHubUser>;
}

/**
 * Get GitHub user's primary verified email
 */
async function getGitHubPrimaryEmail(accessToken: string): Promise<string | null> {
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
}

// ==================== Provider Export ====================

export const githubProvider = {
  /**
   * Generate GitHub authorization URL with state parameter
   */
  generateAuthUrl(returnUrl: string = '/'): string {
    const config = getGitHubConfig();
    const state = generateState(returnUrl);

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      scope: 'read:user user:email',
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },

  /**
   * Handle OAuth callback - main entry point
   */
  async handleCallback(
    code: string,
    state: string,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<OAuthCallbackResult> {
    // Validate state
    const stateData = validateState(state);
    if (!stateData) {
      throw Errors.auth(
        AUTH_ERROR_CODES.TOKEN_INVALID,
        'Login session expired. Please try again.',
        400
      );
    }

    // Exchange code for token
    const accessToken = await exchangeCodeForToken(code);

    // Get GitHub user info
    const githubUser = await getGitHubUser(accessToken);
    const email = githubUser.email || (await getGitHubPrimaryEmail(accessToken));

    if (!email) {
      throw Errors.auth(
        AUTH_ERROR_CODES.OAUTH_FAILED,
        'No verified email found on your GitHub account. Please add and verify an email address in your GitHub settings.',
        400
      );
    }

    // Find or create user
    const user = await findOrCreateOAuthUser({
      providerType: 'github',
      providerId: String(githubUser.id),
      email,
      username: githubUser.login,
      avatarUrl: githubUser.avatar_url,
      accessToken,
      profile: {
        login: githubUser.login,
        name: githubUser.name,
        avatar_url: githubUser.avatar_url,
      },
    });

    // Record login and generate auth response
    const authResponse = await recordOAuthLogin(user, email, 'github', ipAddress, userAgent);

    return { authResponse, returnUrl: stateData.returnUrl };
  },

  /**
   * Map GitHub OAuth error codes to user-friendly messages
   */
  getErrorMessage(error: string): string {
    const errorMessages: Record<string, string> = {
      access_denied: 'You cancelled the GitHub authorization',
      redirect_uri_mismatch: 'OAuth configuration error. Please contact support.',
      application_suspended: 'This application has been suspended',
      bad_verification_code: 'Authorization code expired. Please try again.',
    };

    return errorMessages[error] || 'GitHub authorization failed. Please try again.';
  },
};
