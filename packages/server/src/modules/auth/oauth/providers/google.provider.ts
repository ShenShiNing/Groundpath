import { AUTH_ERROR_CODES } from '@knowledge-agent/shared';
import { Errors } from '@shared/errors';
import { env } from '@config/env';
import type {
  OAuthProviderConfig,
  OAuthCallbackResult,
  GoogleUser,
  GoogleTokenResponse,
} from '../oauth.types';
import {
  generateState,
  validateState,
  findOrCreateOAuthUser,
  recordOAuthLogin,
} from '../oauth.service';

// ==================== Configuration ====================

function getGoogleConfig(): OAuthProviderConfig {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw Errors.auth(
      AUTH_ERROR_CODES.OAUTH_FAILED,
      'Google OAuth is not configured on this server',
      500
    );
  }

  return {
    clientId,
    clientSecret,
    callbackUrl: env.GOOGLE_CALLBACK_URL,
    frontendUrl: env.FRONTEND_URL,
  };
}

// ==================== API Methods ====================

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code: string): Promise<GoogleTokenResponse> {
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
    throw Errors.auth(
      AUTH_ERROR_CODES.OAUTH_FAILED,
      'Unable to connect to Google. Please try again.',
      400
    );
  }

  const data = (await response.json()) as GoogleTokenResponse;
  if (data.error) {
    throw Errors.auth(
      AUTH_ERROR_CODES.OAUTH_FAILED,
      'Google authorization failed. Please try again.',
      400
    );
  }

  return data;
}

/**
 * Get Google user profile
 */
async function getGoogleUser(accessToken: string): Promise<GoogleUser> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw Errors.auth(
      AUTH_ERROR_CODES.OAUTH_FAILED,
      'Unable to retrieve your Google profile. Please try again.',
      400
    );
  }

  return response.json() as Promise<GoogleUser>;
}

// ==================== Provider Export ====================

export const googleProvider = {
  /**
   * Generate Google authorization URL with state parameter
   */
  generateAuthUrl(returnUrl: string = '/'): string {
    const config = getGoogleConfig();
    const state = generateState(returnUrl);

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
    const tokenData = await exchangeCodeForToken(code);

    // Get Google user info
    const googleUser = await getGoogleUser(tokenData.access_token);

    if (!googleUser.email || !googleUser.verified_email) {
      throw Errors.auth(
        AUTH_ERROR_CODES.OAUTH_FAILED,
        'No verified email found on your Google account. Please verify your email address in your Google settings.',
        400
      );
    }

    // Find or create user
    const user = await findOrCreateOAuthUser({
      providerType: 'google',
      providerId: googleUser.id,
      email: googleUser.email,
      username: googleUser.name || googleUser.email,
      avatarUrl: googleUser.picture || null,
      accessToken: tokenData.access_token,
      profile: {
        name: googleUser.name,
        given_name: googleUser.given_name,
        family_name: googleUser.family_name,
        picture: googleUser.picture,
      },
    });

    // Record login and generate auth response
    const authResponse = await recordOAuthLogin(
      user,
      googleUser.email,
      'google',
      ipAddress,
      userAgent
    );

    return { authResponse, returnUrl: stateData.returnUrl };
  },

  /**
   * Map Google OAuth error codes to user-friendly messages
   */
  getErrorMessage(error: string): string {
    const errorMessages: Record<string, string> = {
      access_denied: 'You cancelled the Google authorization',
      redirect_uri_mismatch: 'OAuth configuration error. Please contact support.',
      invalid_request: 'Invalid request. Please try again.',
      unauthorized_client: 'This application is not authorized for Google login.',
      unsupported_response_type: 'OAuth configuration error. Please contact support.',
      invalid_scope: 'OAuth configuration error. Please contact support.',
      server_error: 'Google server error. Please try again later.',
      temporarily_unavailable: 'Google is temporarily unavailable. Please try again later.',
    };

    return errorMessages[error] || 'Google authorization failed. Please try again.';
  },
};
