import type { Request, Response } from 'express';
import { storageService } from '../services/document-storage.service';
import { userService } from '../../user';
import { toUserPublicInfo, requireUserId } from '@core/utils';
import { sendSuccessResponse } from '@core/errors';
import { AppError } from '@core/errors/app-error';
import { asyncHandler } from '@core/errors/async-handler';

export const uploadController = {
  /**
   * POST /api/user/avatar
   */
  uploadAvatar: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);

    const file = req.file;
    if (!file) {
      throw new AppError('VALIDATION_ERROR', 'No file uploaded', 400);
    }

    // Validate file
    const validation = storageService.validateFile(file);
    if (!validation.valid) {
      throw new AppError('VALIDATION_ERROR', validation.error!, 400);
    }

    // Get current user to check for existing avatar
    const user = await userService.findById(userId);
    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Delete old avatar if exists
    if (user.avatarUrl) {
      try {
        await storageService.deleteByUrl(user.avatarUrl);
      } catch {
        // Ignore deletion errors
      }
    }

    // Upload new avatar
    const avatarUrl = await storageService.uploadAvatar(userId, file);

    // Update user profile
    const updatedUser = await userService.updateProfileInternal(userId, { avatarUrl });

    if (!updatedUser) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    sendSuccessResponse(res, toUserPublicInfo(updatedUser));
  }),
};
