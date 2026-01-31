import { env } from './env';

// JWT Authentication Configuration
export const AUTH_CONFIG = {
  // Access Token - short-lived, contains user info
  accessToken: {
    secret: env.JWT_ACCESS_SECRET,
    expiresIn: '15m',
    expiresInSeconds: 15 * 60, // 15 minutes
  },

  // Refresh Token - long-lived, stored in database
  refreshToken: {
    secret: env.JWT_REFRESH_SECRET,
    expiresIn: '7d',
    expiresInSeconds: 7 * 24 * 60 * 60, // 7 days
  },

  // Password hashing
  bcrypt: {
    saltRounds: 12,
  },
} as const;
