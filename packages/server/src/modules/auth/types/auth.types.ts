// ==================== Token Payloads (Server Only) ====================

/** Access Token payload - contains user info for API authorization */
export interface AccessTokenPayload {
  sub: string; // User ID
  email: string;
  username: string;
  status: 'active' | 'inactive' | 'banned';
  emailVerified: boolean;
}

/** Refresh Token payload - minimal, actual data stored in DB */
export interface RefreshTokenPayload {
  sub: string; // User ID
  jti: string; // Token ID (maps to refresh_tokens.id)
  type: 'refresh';
}

/** Context attached when authenticating with refresh token */
export interface RefreshTokenContext {
  sub: string; // User ID
  jti: string; // Token ID
}

// ==================== Express Request Extension ====================
declare module 'express' {
  interface Request {
    user?: AccessTokenPayload;
    refreshContext?: RefreshTokenContext;
  }

  interface Locals {
    /** Validated request data from Zod schemas */
    validated?: {
      body?: unknown;
      query?: unknown;
      params?: unknown;
    };
  }
}
