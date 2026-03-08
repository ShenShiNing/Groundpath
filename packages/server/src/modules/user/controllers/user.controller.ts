import type { Request, Response } from 'express';
import type { UpdateProfileRequest } from '@knowledge-agent/shared/types';
import { userService } from '../services/user.service';
import { sendSuccessResponse } from '@shared/errors';
import { asyncHandler } from '@shared/errors/async-handler';
import { getValidatedBody } from '@shared/middleware';
import { requireUserId } from '@shared/utils';

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
