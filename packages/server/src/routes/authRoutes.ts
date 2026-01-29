import express from 'express';
import { authController } from '../controller/authController';
import { oauthController } from '../controller/oauthController';
import { authenticate, authenticateRefreshToken } from '../middleware/authMiddleware';
import {
  loginRateLimiter,
  registerRateLimiter,
  refreshRateLimiter,
  generalRateLimiter,
  passwordResetRateLimiter,
} from '../middleware/rateLimitMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
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

// ==================== OAuth Routes ====================

// GitHub OAuth
router.get('/github', oauthController.githubAuth);
router.get('/github/callback', oauthController.githubCallback);

// Google OAuth
router.get('/google', oauthController.googleAuth);
router.get('/google/callback', oauthController.googleCallback);

export default router;
