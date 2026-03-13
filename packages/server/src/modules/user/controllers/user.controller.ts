import type { Request, Response } from 'express';
import type { UpdateProfileRequest } from '@knowledge-agent/shared/types';
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
};
