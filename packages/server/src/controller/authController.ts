import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type {
  ApiResponse,
  LoginRequest,
  RefreshRequest,
  AuthResponse,
  SessionInfo,
  UserPublicInfo,
} from '@knowledge-agent/shared';
import { authService } from '../services/authService';
import { isAuthError } from '../utils/errors';

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
 * Handle errors and send appropriate response
 */
function handleError(error: unknown, res: Response): void {
  if (isAuthError(error)) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
    res.status(error.statusCode).json(response);
    return;
  }

  console.error('Auth controller error:', error);
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };
  res.status(HTTP_STATUS.INTERNAL_ERROR).json(response);
}

/**
 * Auth controller handlers
 */
export const authController = {
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
      handleError(error, res);
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
      handleError(error, res);
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
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Token ID not found',
          },
        };
        res.status(HTTP_STATUS.BAD_REQUEST).json(response);
        return;
      }

      await authService.logout(tokenJti);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Successfully logged out' },
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res);
    }
  },

  /**
   * POST /api/auth/logout-all
   * Logout all devices
   */
  async logoutAll(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        };
        res.status(HTTP_STATUS.UNAUTHORIZED).json(response);
        return;
      }

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
      handleError(error, res);
    }
  },

  /**
   * GET /api/auth/me
   * Get current user info
   */
  async me(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        };
        res.status(HTTP_STATUS.UNAUTHORIZED).json(response);
        return;
      }

      const user = await authService.getCurrentUser(userId);

      const response: ApiResponse<UserPublicInfo> = {
        success: true,
        data: user,
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res);
    }
  },

  /**
   * GET /api/auth/sessions
   * Get active sessions for current user
   */
  async sessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.sub;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        };
        res.status(HTTP_STATUS.UNAUTHORIZED).json(response);
        return;
      }

      const sessions = await authService.getSessions(userId);

      const response: ApiResponse<SessionInfo[]> = {
        success: true,
        data: sessions,
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res);
    }
  },

  /**
   * DELETE /api/auth/sessions/:id
   * Revoke a specific session
   */
  async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.sub;
      const sessionIdParam = req.params.id;
      const sessionId = Array.isArray(sessionIdParam) ? sessionIdParam[0] : sessionIdParam;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User not authenticated',
          },
        };
        res.status(HTTP_STATUS.UNAUTHORIZED).json(response);
        return;
      }

      if (!sessionId) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Session ID is required',
          },
        };
        res.status(HTTP_STATUS.BAD_REQUEST).json(response);
        return;
      }

      await authService.revokeSession(userId, sessionId);

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Session revoked successfully' },
      };
      res.status(HTTP_STATUS.OK).json(response);
    } catch (error) {
      handleError(error, res);
    }
  },
};
