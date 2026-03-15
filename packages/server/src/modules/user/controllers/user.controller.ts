import type { Request, Response } from 'express';
import type { ChangeEmailRequest, UpdateProfileRequest } from '@knowledge-agent/shared/types';
import { userService } from '../services/user.service';
import { sendSuccessResponse } from '@core/errors';
import { AppError } from '@core/errors/app-error';
import { asyncHandler } from '@core/errors/async-handler';
import { getValidatedBody } from '@core/middleware';
import { requireUserId, toUserPublicInfo } from '@core/utils';
import { storageService } from '@modules/document/services';

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
    const file = req.file;

    if (!file) {
      throw new AppError('VALIDATION_ERROR', 'No file uploaded', 400);
    }

    const validation = storageService.validateFile(file);
    if (!validation.valid) {
      throw new AppError('VALIDATION_ERROR', validation.error!, 400);
    }

    const user = await userService.findById(userId);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    if (user.avatarUrl) {
      try {
        await storageService.deleteByUrl(user.avatarUrl);
      } catch {
        // Ignore deletion errors.
      }
    }

    const avatarUrl = await storageService.uploadAvatar(userId, file);
    const updatedUser = await userService.updateProfileInternal(userId, { avatarUrl });

    if (!updatedUser) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    sendSuccessResponse(res, toUserPublicInfo(updatedUser));
  }),
};
