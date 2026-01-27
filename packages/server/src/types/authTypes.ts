import type { User } from '../db/schema/user/users';
import type { UserPublicInfo } from '@knowledge-agent/shared/types';

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

// ==================== Utility Types (Server Only) ====================

/** Extract public info from User entity */
export function toUserPublicInfo(user: User): UserPublicInfo {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    status: user.status,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

// ==================== Express Request Extension ====================
declare module 'express' {
  interface Request {
    user?: AccessTokenPayload;
    refreshContext?: RefreshTokenContext;
  }
}
