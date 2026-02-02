import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type { CreateFolderRequest, UpdateFolderRequest } from '@knowledge-agent/shared/types';
import { folderService } from '../services/folder.service';
import { sendSuccessResponse } from '@shared/errors';
import { AppError } from '@shared/errors/app-error';
import { asyncHandler } from '@shared/errors/async-handler';
import { requireUserId, getParamId, getClientIp } from '@shared/utils/request.utils';

/**
 * Simple UUID validation
 */
function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Extract request context for logging
 */
function getRequestContext(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] ?? null,
  };
}

export const folderController = {
  /**
   * POST /api/folders
   */
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = req.body as CreateFolderRequest;
    const folder = await folderService.create(userId, data, getRequestContext(req));
    sendSuccessResponse(res, folder, HTTP_STATUS.CREATED);
  }),

  /**
   * GET /api/folders
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const { format } = req.query as { format?: 'flat' | 'tree' };

    if (format === 'tree') {
      const tree = await folderService.getTree(userId);
      sendSuccessResponse(res, tree);
    } else {
      const folders = await folderService.list(userId);
      sendSuccessResponse(res, folders);
    }
  }),

  /**
   * GET /api/folders/:id
   */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const folderId = getParamId(req, 'id');
    if (!folderId) {
      throw new AppError('VALIDATION_ERROR', 'Folder ID is required', 400);
    }

    const folder = await folderService.getById(folderId, userId);
    sendSuccessResponse(res, folder);
  }),

  /**
   * GET /api/folders/:id/children
   */
  getChildren: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const folderId = getParamId(req, 'id');
    // id can be 'root' for root-level folders
    const parentId = folderId === 'root' ? null : (folderId ?? null);

    if (parentId && !isValidUuid(parentId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid folder ID', 400);
    }

    const children = await folderService.listChildren(userId, parentId);
    sendSuccessResponse(res, children);
  }),

  /**
   * PATCH /api/folders/:id
   */
  update: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const folderId = getParamId(req, 'id');
    if (!folderId) {
      throw new AppError('VALIDATION_ERROR', 'Folder ID is required', 400);
    }

    const data = req.body as UpdateFolderRequest;
    const folder = await folderService.update(folderId, userId, data, getRequestContext(req));
    sendSuccessResponse(res, folder);
  }),

  /**
   * DELETE /api/folders/:id
   */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const folderId = getParamId(req, 'id');
    if (!folderId) {
      throw new AppError('VALIDATION_ERROR', 'Folder ID is required', 400);
    }

    const { moveContentsToRoot } = req.query as { moveContentsToRoot?: string };

    await folderService.delete(
      folderId,
      userId,
      { moveContentsToRoot: moveContentsToRoot === 'true' },
      getRequestContext(req)
    );
    sendSuccessResponse(res, { message: 'Folder deleted successfully' });
  }),
};
