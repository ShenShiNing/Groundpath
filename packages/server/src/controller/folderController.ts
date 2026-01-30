import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type { CreateFolderRequest, UpdateFolderRequest } from '@knowledge-agent/shared/types';
import { folderService } from '../services/folderService';
import { handleError, sendErrorResponse, sendSuccessResponse } from '../utils/errors';

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
 * Get string param from request params (handles Express 5 string | string[] type)
 */
function getParamId(req: Request, paramName: string): string | undefined {
  const value = req.params[paramName];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Folder controller handlers
 */
export const folderController = {
  /**
   * POST /api/folders
   * Create a new folder
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const data = req.body as CreateFolderRequest;
      const folder = await folderService.create(userId, data);
      sendSuccessResponse(res, folder, HTTP_STATUS.CREATED);
    } catch (error) {
      handleError(error, res, 'Folder controller');
    }
  },

  /**
   * GET /api/folders
   * List all folders (flat or tree)
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const { format } = req.query as { format?: 'flat' | 'tree' };

      if (format === 'tree') {
        const tree = await folderService.getTree(userId);
        sendSuccessResponse(res, tree);
      } else {
        const folders = await folderService.list(userId);
        sendSuccessResponse(res, folders);
      }
    } catch (error) {
      handleError(error, res, 'Folder controller');
    }
  },

  /**
   * GET /api/folders/:id
   * Get folder details
   */
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const folderId = getParamId(req, 'id');
      if (!folderId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Folder ID is required'
        );
        return;
      }

      const folder = await folderService.getById(folderId, userId);
      sendSuccessResponse(res, folder);
    } catch (error) {
      handleError(error, res, 'Folder controller');
    }
  },

  /**
   * GET /api/folders/:id/children
   * Get child folders
   */
  async getChildren(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const folderId = getParamId(req, 'id');
      // id can be 'root' for root-level folders
      const parentId = folderId === 'root' ? null : (folderId ?? null);

      if (parentId && !isValidUuid(parentId)) {
        sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, 'VALIDATION_ERROR', 'Invalid folder ID');
        return;
      }

      const children = await folderService.listChildren(userId, parentId);
      sendSuccessResponse(res, children);
    } catch (error) {
      handleError(error, res, 'Folder controller');
    }
  },

  /**
   * PATCH /api/folders/:id
   * Update folder
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const folderId = getParamId(req, 'id');
      if (!folderId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Folder ID is required'
        );
        return;
      }

      const data = req.body as UpdateFolderRequest;
      const folder = await folderService.update(folderId, userId, data);
      sendSuccessResponse(res, folder);
    } catch (error) {
      handleError(error, res, 'Folder controller');
    }
  },

  /**
   * DELETE /api/folders/:id
   * Delete folder
   */
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireUserId(req, res);
      if (!userId) return;

      const folderId = getParamId(req, 'id');
      if (!folderId) {
        sendErrorResponse(
          res,
          HTTP_STATUS.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Folder ID is required'
        );
        return;
      }

      const { moveContentsToRoot } = req.query as { moveContentsToRoot?: string };

      await folderService.delete(folderId, userId, {
        moveContentsToRoot: moveContentsToRoot === 'true',
      });
      sendSuccessResponse(res, { message: 'Folder deleted successfully' });
    } catch (error) {
      handleError(error, res, 'Folder controller');
    }
  },
};

/**
 * Simple UUID validation
 */
function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
