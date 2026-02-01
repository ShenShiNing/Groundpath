import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@knowledge-agent/shared';
import type {
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
} from '@knowledge-agent/shared/types';
import { knowledgeBaseService } from '../services/knowledge-base.service';
import { sendSuccessResponse } from '@shared/errors/errors';
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

export const knowledgeBaseController = {
  /**
   * POST /api/knowledge-bases
   */
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = req.body as CreateKnowledgeBaseRequest;
    const kb = await knowledgeBaseService.create(userId, data, getRequestContext(req));
    sendSuccessResponse(res, kb, HTTP_STATUS.CREATED);
  }),

  /**
   * GET /api/knowledge-bases
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbs = await knowledgeBaseService.list(userId);
    sendSuccessResponse(res, kbs);
  }),

  /**
   * GET /api/knowledge-bases/:id
   */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = getParamId(req, 'id');
    if (!kbId || !isValidUuid(kbId)) {
      throw new AppError('VALIDATION_ERROR', 'Valid knowledge base ID is required', 400);
    }

    const kb = await knowledgeBaseService.getById(kbId, userId);
    sendSuccessResponse(res, kb);
  }),

  /**
   * PATCH /api/knowledge-bases/:id
   */
  update: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = getParamId(req, 'id');
    if (!kbId || !isValidUuid(kbId)) {
      throw new AppError('VALIDATION_ERROR', 'Valid knowledge base ID is required', 400);
    }

    const data = req.body as UpdateKnowledgeBaseRequest;
    const kb = await knowledgeBaseService.update(kbId, userId, data, getRequestContext(req));
    sendSuccessResponse(res, kb);
  }),

  /**
   * DELETE /api/knowledge-bases/:id
   */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = getParamId(req, 'id');
    if (!kbId || !isValidUuid(kbId)) {
      throw new AppError('VALIDATION_ERROR', 'Valid knowledge base ID is required', 400);
    }

    await knowledgeBaseService.delete(kbId, userId, getRequestContext(req));
    sendSuccessResponse(res, { message: 'Knowledge base deleted successfully' });
  }),
};
