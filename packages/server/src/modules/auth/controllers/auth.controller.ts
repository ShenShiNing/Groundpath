import type { Request, Response } from 'express';
import { HTTP_STATUS, AUTH_ERROR_CODES } from '@groundpath/shared';
import type {
  LoginRequest,
  RegisterRequest,
  ChangePasswordRequest,
  RegisterWithCodeRequest,
  ResetPasswordRequest,
  AuthResponse,
} from '@groundpath/shared';
import { authService } from '../services/auth.service';
import { sessionService } from '../services/session.service';
import { passwordService } from '../services/password.service';
import { sendSuccessResponse, Errors } from '@core/errors';
import { AppError } from '@core/errors/app-error';
import { asyncHandler } from '@core/errors/async-handler';
import { getValidatedBody } from '@core/middleware';
import {
  getClientIp,
  requireUserId,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
} from '@core/utils';

/**
 * Set refresh token as HttpOnly cookie and strip it from the JSON response
 */
function sendAuthResponse(
  res: Response,
  authResponse: AuthResponse,
  statusCode: number = HTTP_STATUS.OK
): void {
  setRefreshTokenCookie(res, authResponse.tokens.refreshToken);

  const sanitized: AuthResponse = {
    ...authResponse,
    tokens: {
      ...authResponse.tokens,
      refreshToken: '',
      refreshExpiresIn: 0,
    },
  };

  sendSuccessResponse(res, sanitized, statusCode);
}

/**
 * Auth controller handlers
 */
export const authController = {
  /**
   * POST /api/auth/register
   */
  register: asyncHandler(async (req: Request, res: Response) => {
    const registerRequest = getValidatedBody<RegisterRequest>(res);
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await authService.register(registerRequest, ipAddress, userAgent);
    sendAuthResponse(res, result, HTTP_STATUS.CREATED);
  }),

  /**
   * PUT /api/auth/password
   */
  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { oldPassword, newPassword } = getValidatedBody<ChangePasswordRequest>(res);
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    await passwordService.changePassword(userId, oldPassword, newPassword, ipAddress, userAgent);
    sendSuccessResponse(res, { message: 'Password changed successfully' });
  }),

  /**
   * POST /api/auth/login
   */
  login: asyncHandler(async (req: Request, res: Response) => {
    const loginRequest = getValidatedBody<LoginRequest>(res);
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await authService.login(loginRequest, ipAddress, userAgent);
    sendAuthResponse(res, result);
  }),

  /**
   * POST /api/auth/refresh
   */
  refresh: asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      throw Errors.auth(AUTH_ERROR_CODES.MISSING_TOKEN, 'Refresh token required');
    }

    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await authService.refresh(refreshToken, ipAddress, userAgent);
    sendAuthResponse(res, result);
  }),

  /**
   * POST /api/auth/logout
   */
  logout: asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.refreshContext?.sid;
    if (!sessionId) {
      throw new AppError('VALIDATION_ERROR', 'Session ID not found', 400);
    }

    const userId = req.refreshContext?.sub;
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    await sessionService.logout(sessionId, userId, ipAddress, userAgent);
    clearRefreshTokenCookie(res);
    sendSuccessResponse(res, { message: 'Successfully logged out' });
  }),

  /**
   * POST /api/auth/logout-all
   */
  logoutAll: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const revokedCount = await sessionService.logoutAll(userId, ipAddress, userAgent);
    clearRefreshTokenCookie(res);
    sendSuccessResponse(res, {
      message: 'Successfully logged out from all devices',
      revokedSessions: revokedCount,
    });
  }),

  /**
   * GET /api/auth/me
   */
  me: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const user = await authService.getCurrentUser(userId);
    sendSuccessResponse(res, user);
  }),

  /**
   * GET /api/auth/sessions
   */
  sessions: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const currentSessionId = req.user?.sid;
    const sessions = await sessionService.getSessions(userId, currentSessionId);
    sendSuccessResponse(res, sessions);
  }),

  /**
   * DELETE /api/auth/sessions/:id
   */
  revokeSession: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const sessionIdParam = req.params.id;
    const sessionId = Array.isArray(sessionIdParam) ? sessionIdParam[0] : sessionIdParam;

    if (!sessionId) {
      throw new AppError('VALIDATION_ERROR', 'Session ID is required', 400);
    }

    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    await sessionService.revokeSession(userId, sessionId, ipAddress, userAgent);
    sendSuccessResponse(res, { message: 'Session revoked successfully' });
  }),

  /**
   * POST /api/auth/register-with-code
   */
  registerWithCode: asyncHandler(async (req: Request, res: Response) => {
    const registerRequest = getValidatedBody<RegisterWithCodeRequest>(res);
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await authService.registerWithCode(registerRequest, ipAddress, userAgent);
    sendAuthResponse(res, result, HTTP_STATUS.CREATED);
  }),

  /**
   * POST /api/auth/reset-password
   */
  resetPassword: asyncHandler(async (_req: Request, res: Response) => {
    const resetRequest = getValidatedBody<ResetPasswordRequest>(res);
    const result = await passwordService.resetPassword(resetRequest);
    sendSuccessResponse(res, result);
  }),
};
