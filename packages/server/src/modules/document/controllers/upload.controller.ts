import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import { storageService } from '../services/document-storage.service';
import { userService } from '../../user';
import { toUserPublicInfo } from '@shared/utils/userMappers';
import { handleError, sendErrorResponse, sendSuccessResponse } from '@shared/errors/errors';

/**
 * Upload controller handlers
 */
export const uploadController = {
  /**
   * POST /api/user/avatar
   * Upload user avatar
   */
  async uploadAvatar(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        sendErrorResponse(res, HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED', 'User not authenticated');
        return;
      }

      const file = req.file;
      if (!file) {
        sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', 'No file uploaded');
        return;
      }

      // Validate file
      const validation = storageService.validateFile(file);
      if (!validation.valid) {
        sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', validation.error!);
        return;
      }

      // Get current user to check for existing avatar
      const user = await userService.findById(userId);
      if (!user) {
        sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, 'USER_NOT_FOUND', 'User not found');
        return;
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
        sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, 'USER_NOT_FOUND', 'User not found');
        return;
      }

      sendSuccessResponse(res, toUserPublicInfo(updatedUser));
    } catch (error) {
      handleError(error, res, 'Upload controller');
    }
  },
};
