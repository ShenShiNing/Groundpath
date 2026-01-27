import { AUTH_ERROR_CODES } from '../constants';
import type { DeviceInfo } from '../schemas/auth';

// ==================== Token Response ====================

/** Token pair returned on login/refresh */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // Access token expiry in seconds
  refreshExpiresIn: number; // Refresh token expiry in seconds
}

// ==================== Auth Responses ====================

/** Public user info (safe to expose) */
export interface UserPublicInfo {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  status: 'active' | 'inactive' | 'banned';
  emailVerified: boolean;
  createdAt: Date;
}

/** Auth response on login/refresh */
export interface AuthResponse {
  user: UserPublicInfo;
  tokens: TokenPair;
}

// ==================== Request Types ====================

// Re-export types from schemas (inferred from Zod schemas)
export type { LoginRequest, RefreshRequest, DeviceInfo } from '../schemas/auth';

// ==================== Session Types ====================

/** Active session info */
export interface SessionInfo {
  id: string;
  deviceInfo: DeviceInfo | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  isCurrent: boolean;
}

// ==================== Error Types ====================

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
