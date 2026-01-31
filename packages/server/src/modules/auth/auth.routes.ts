import express from 'express';
import { authController } from './controllers/auth.controller';
import { authenticate, authenticateRefreshToken } from '@shared/middleware/auth.middleware';
import {
  loginRateLimiter,
  registerRateLimiter,
  refreshRateLimiter,
  generalRateLimiter,
  passwordResetRateLimiter,
} from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validation.middleware';
import {
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  changePasswordRequestSchema,
  registerWithCodeRequestSchema,
  resetPasswordRequestSchema,
} from '@knowledge-agent/shared/schemas';

const router = express.Router();

// ==================== Public Routes ====================

// Register new user
router.post(
  '/register',
  registerRateLimiter,
  validateBody(registerRequestSchema),
  authController.register
);

// Register with verified email (code-based flow)
router.post(
  '/register-with-code',
  registerRateLimiter,
  validateBody(registerWithCodeRequestSchema),
  authController.registerWithCode
);

// Login with email/password
router.post('/login', loginRateLimiter, validateBody(loginRequestSchema), authController.login);

// Refresh access token
router.post(
  '/refresh',
  refreshRateLimiter,
  validateBody(refreshRequestSchema),
  authController.refresh
);

// Reset password with verified email
router.post(
  '/reset-password',
  passwordResetRateLimiter,
  validateBody(resetPasswordRequestSchema),
  authController.resetPassword
);

// ==================== Protected Routes (Refresh Token Auth) ====================

// Logout current device - requires refresh token in body
router.post('/logout', authenticateRefreshToken, authController.logout);

// ==================== Protected Routes (Access Token Auth) ====================

// Change password
router.put(
  '/password',
  generalRateLimiter,
  authenticate,
  validateBody(changePasswordRequestSchema),
  authController.changePassword
);

// Logout all devices
router.post('/logout-all', authenticate, authController.logoutAll);

// Get current user info
router.get('/me', generalRateLimiter, authenticate, authController.me);

// Get active sessions
router.get('/sessions', generalRateLimiter, authenticate, authController.sessions);

// Revoke a specific session
router.delete('/sessions/:id', generalRateLimiter, authenticate, authController.revokeSession);

export default router;
