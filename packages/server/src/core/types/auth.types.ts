// ==================== Token Payloads (Server Only) ====================

/** Shared user claims used to build session-bound tokens */
export interface AccessTokenSubject {
  sub: string; // User ID
  email: string;
  username: string;
  status: 'active' | 'inactive' | 'banned';
  emailVerified: boolean;
}

/** Access token payload - session-bound user claims */
export interface AccessTokenPayload extends AccessTokenSubject {
  sid: string; // Session ID (refresh_tokens.id)
}

/** Refresh Token payload - minimal, session-bound */
export interface RefreshTokenPayload {
  sub: string; // User ID
  sid: string; // Session ID (refresh_tokens.id)
  jti: string; // Token ID (maps to refresh_tokens.id)
  type: 'refresh';
}

/** Context attached when authenticating with refresh token */
export interface RefreshTokenContext {
  sub: string; // User ID
  sid: string; // Session ID
  jti: string; // Token ID
}
