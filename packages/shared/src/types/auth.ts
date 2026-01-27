import { AUTH_ERROR_CODES } from '../constants';

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

/** Login request body */
export interface LoginRequest {
  email: string;
  password: string;
  deviceInfo?: DeviceInfo;
}

/** Refresh token request body */
export interface RefreshRequest {
  refreshToken: string;
}

/** Device information for session tracking */
export interface DeviceInfo {
  userAgent?: string;
  deviceType?: string;
  os?: string;
  browser?: string;
}

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
