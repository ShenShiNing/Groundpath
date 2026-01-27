import express from 'express';
import { authController } from '../controller/authController';
import { authenticate, authenticateRefreshToken } from '../middleware/authMiddleware';
import {
  loginRateLimiter,
  refreshRateLimiter,
  generalRateLimiter,
} from '../middleware/rateLimitMiddleware';
import { validateBody } from '../middleware/validationMiddleware';
import { loginRequestSchema, refreshRequestSchema } from '@knowledge-agent/shared/schemas';

const router = express.Router();

// ==================== Public Routes ====================

// Login with email/password
router.post('/login', loginRateLimiter, validateBody(loginRequestSchema), authController.login);

// Refresh access token
router.post(
  '/refresh',
  refreshRateLimiter,
  validateBody(refreshRequestSchema),
  authController.refresh
);

// ==================== Protected Routes (Refresh Token Auth) ====================

// Logout current device - requires refresh token in body
router.post('/logout', authenticateRefreshToken, authController.logout);

// ==================== Protected Routes (Access Token Auth) ====================

// Logout all devices
router.post('/logout-all', authenticate, authController.logoutAll);

// Get current user info
router.get('/me', generalRateLimiter, authenticate, authController.me);

// Get active sessions
router.get('/sessions', generalRateLimiter, authenticate, authController.sessions);

// Revoke a specific session
router.delete('/sessions/:id', generalRateLimiter, authenticate, authController.revokeSession);

export default router;
