import type { AuthResponse } from '@knowledge-agent/shared/types';

// ==================== State Store Types ====================

export interface OAuthStateData {
  returnUrl: string;
  expiresAt: number;
}

// ==================== Provider Types ====================

export type OAuthProviderType = 'github' | 'google';

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  frontendUrl: string;
}

export interface OAuthCallbackResult {
  authResponse: AuthResponse;
  returnUrl: string;
}

// ==================== GitHub Types ====================

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
}

export interface GitHubProfile {
  login: string;
  name: string | null;
  avatar_url: string;
}

// ==================== Google Types ====================

export interface GoogleUser {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
}

export interface GoogleProfile {
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

// ==================== OAuth User Data ====================

export interface OAuthUserData {
  providerType: OAuthProviderType;
  providerId: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  accessToken: string;
  profile: Record<string, unknown>;
}

// ==================== Error Messages ====================

export type OAuthErrorMessages = Record<string, string>;
