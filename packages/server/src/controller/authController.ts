import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type {
  ApiResponse,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  ChangePasswordRequest,
  AuthResponse,
  SessionInfo,
  UserPublicInfo,
} from '@knowledge-agent/shared';
import { authService } from '../services/authService';
import { handleError, sendErrorResponse } from '../utils/errors';

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips?.trim() ?? null;
  }
  return req.socket.remoteAddress ?? null;
}

/**
 * Extract authenticated user ID from request, or send 401 response.
 * Returns the user ID if authenticated, or null if the response was already sent.
 */
function requireUserId(req: Request, res: Response): string | null {
  const userId = req.user?.sub;
  if (!userId) {
    sendErrorResponse(res, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED', 'User not authenticated');
    return null;
  }
  return userId;
}

/**
 * Auth controller handlers
 */
export const authController = {
  /**
   * POST /api/auth/register
   * Register a new user
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const registerRequest = req.body as RegisterRequest;

      const ipAddress = getClientIp(req);
      const userAgent = req.headers['user-agent'] ?? null;

      const result = await authService.register(registerRequest, ipAddress, userAgent);

      const response: ApiResponse<AuthResponse> = {
        success: true,
        data: result,
      };
      res.status(HTTP_STATUS.CREATED).json(response);
    } catch (error) {
      handleError(error, res, 'Auth controller');
    }
  },

  /**
   * PUT /api/auth/password
   * Change user password
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const { oldPassword, newPassword } = req.body as ChangePasswordRequest;

      await authService.changePassword(userId, oldPassword, newPassword);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Password changed successfully' },
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res, 'Auth controller');
    }
  },

  /**
   * POST /api/auth/login
   * Login with email and password
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const loginRequest = req.body as LoginRequest;

      const ipAddress = getClientIp(req);
      const userAgent = req.headers['user-agent'] ?? null;

      const result = await authService.login(loginRequest, ipAddress, userAgent);

      const response: ApiResponse<AuthResponse> = {
        success: true,
        data: result,
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res, 'Auth controller');
    }
  },

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   */
  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body as RefreshRequest;

      const ipAddress = getClientIp(req);
      const userAgent = req.headers['user-agent'] ?? null;

      const result = await authService.refresh(refreshToken, ipAddress, userAgent);

      const response: ApiResponse<AuthResponse> = {
        success: true,
        data: result,
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res, 'Auth controller');
    }
  },

  /**
   * POST /api/auth/logout
   * Logout current device
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const tokenJti = req.refreshContext?.jti;
      if (!tokenJti) {
        sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', 'Token ID not found');
        return;
      }

      await authService.logout(tokenJti);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Successfully logged out' },
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res, 'Auth controller');
    }
  },

  /**
   * POST /api/auth/logout-all
   * Logout all devices
   */
  async logoutAll(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const revokedCount = await authService.logoutAll(userId);

      const response: ApiResponse<{ message: string; revokedSessions: number }> = {
        success: true,
        data: {
          message: 'Successfully logged out from all devices',
          revokedSessions: revokedCount,
        },
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res, 'Auth controller');
    }
  },

  /**
   * GET /api/auth/me
   * Get current user info
   */
  async me(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const user = await authService.getCurrentUser(userId);

      const response: ApiResponse<UserPublicInfo> = {
        success: true,
        data: user,
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res, 'Auth controller');
    }
  },

  /**
   * GET /api/auth/sessions
   * Get active sessions for current user
   */
  async sessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const sessions = await authService.getSessions(userId);

      const response: ApiResponse<SessionInfo[]> = {
        success: true,
        data: sessions,
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res, 'Auth controller');
    }
  },

  /**
   * DELETE /api/auth/sessions/:id
   * Revoke a specific session
   */
  async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const sessionIdParam = req.params.id;
      const sessionId = Array.isArray(sessionIdParam) ? sessionIdParam[0] : sessionIdParam;

      if (!sessionId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Session ID is required'
        );
        return;
      }

      await authService.revokeSession(userId, sessionId);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Session revoked successfully' },
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res, 'Auth controller');
    }
  },
};
