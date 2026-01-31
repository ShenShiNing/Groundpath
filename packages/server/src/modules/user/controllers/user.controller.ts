import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type { UpdateProfileRequest } from '@knowledge-agent/shared/types';
import { userService } from '../services/user.service';
import { handleError, sendErrorResponse, sendSuccessResponse } from '@shared/errors/errors';

/**
 * Extract authenticated user ID from request, or send 401 response.
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
 * User controller handlers
 */
export const userController = {
  /**
   * PATCH /api/user/profile
   * Update user profile
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const data = req.body as UpdateProfileRequest;

      const user = await userService.updateProfile(userId, data);
      sendSuccessResponse(res, user);
    } catch (error) {
      handleError(error, res, 'User controller');
    }
  },
};
