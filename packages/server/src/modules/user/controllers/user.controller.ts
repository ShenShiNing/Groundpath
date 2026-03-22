import type { Request, Response } from 'express';
import type { ChangeEmailRequest, UpdateProfileRequest } from '@groundpath/shared/types';
import { userService } from '../services/user.service';
import { sendSuccessResponse } from '@core/errors';
import { asyncHandler } from '@core/errors/async-handler';
import { getValidatedBody } from '@core/middleware';
import { requireUserId } from '@core/utils';

export const userController = {
  /**
   * PATCH /api/user/profile
   */
  updateProfile: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = getValidatedBody<UpdateProfileRequest>(res);

    const user = await userService.updateProfile(userId, data);
    sendSuccessResponse(res, user);
  }),

  /**
   * PATCH /api/user/email
   */
  changeEmail: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = getValidatedBody<ChangeEmailRequest>(res);

    const user = await userService.changeEmail(userId, data);
    sendSuccessResponse(res, user);
  }),

  /**
   * POST /api/user/avatar
   */
  uploadAvatar: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const user = await userService.uploadAvatar(userId, req.file);
    sendSuccessResponse(res, user);
  }),
};
