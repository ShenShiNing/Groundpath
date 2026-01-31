import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type {
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  ChangePasswordRequest,
  RegisterWithCodeRequest,
  ResetPasswordRequest,
} from '@knowledge-agent/shared';
import { authService } from '../services/auth.service';
import { sendSuccessResponse } from '@shared/errors/errors';
import { AppError } from '@shared/errors/app-error';
import { asyncHandler } from '@shared/errors/async-handler';
import { getClientIp, requireUserId } from '@shared/utils/request.utils';

/**
 * Auth controller handlers
 */
export const authController = {
  /**
   * POST /api/auth/register
   */
  register: asyncHandler(async (req: Request, res: Response) => {
    const registerRequest = req.body as RegisterRequest;
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await authService.register(registerRequest, ipAddress, userAgent);
    sendSuccessResponse(res, result, HTTP_STATUS.CREATED);
  }),

  /**
   * PUT /api/auth/password
   */
  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { oldPassword, newPassword } = req.body as ChangePasswordRequest;

    await authService.changePassword(userId, oldPassword, newPassword);
    sendSuccessResponse(res, { message: 'Password changed successfully' });
  }),

  /**
   * POST /api/auth/login
   */
  login: asyncHandler(async (req: Request, res: Response) => {
    const loginRequest = req.body as LoginRequest;
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await authService.login(loginRequest, ipAddress, userAgent);
    sendSuccessResponse(res, result);
  }),

  /**
   * POST /api/auth/refresh
   */
  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as RefreshRequest;
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await authService.refresh(refreshToken, ipAddress, userAgent);
    sendSuccessResponse(res, result);
  }),

  /**
   * POST /api/auth/logout
   */
  logout: asyncHandler(async (req: Request, res: Response) => {
    const tokenJti = req.refreshContext?.jti;
    if (!tokenJti) {
      throw new AppError('VALIDATION_ERROR', 'Token ID not found', 400);
    }

    await authService.logout(tokenJti);
    sendSuccessResponse(res, { message: 'Successfully logged out' });
  }),

  /**
   * POST /api/auth/logout-all
   */
  logoutAll: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const revokedCount = await authService.logoutAll(userId);
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
    const sessions = await authService.getSessions(userId);
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

    await authService.revokeSession(userId, sessionId);
    sendSuccessResponse(res, { message: 'Session revoked successfully' });
  }),

  /**
   * POST /api/auth/register-with-code
   */
  registerWithCode: asyncHandler(async (req: Request, res: Response) => {
    const registerRequest = req.body as RegisterWithCodeRequest;
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'] ?? null;

    const result = await authService.registerWithCode(registerRequest, ipAddress, userAgent);
    sendSuccessResponse(res, result, HTTP_STATUS.CREATED);
  }),

  /**
   * POST /api/auth/reset-password
   */
  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const resetRequest = req.body as ResetPasswordRequest;
    const result = await authService.resetPassword(resetRequest);
    sendSuccessResponse(res, result);
  }),
};
