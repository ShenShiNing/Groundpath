import type { Request, Response } from 'express';
import { HTTP_STATUS } from '@groundpath/shared';
import type {
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KnowledgeBaseListParams,
  DocumentListParams,
} from '@groundpath/shared/types';
import { knowledgeBaseService } from '../services/knowledge-base.service';
import { documentService } from '@modules/document';
import { sendSuccessResponse } from '@core/errors';
import { AppError } from '@core/errors/app-error';
import { asyncHandler } from '@core/errors/async-handler';
import { getValidatedBody, getValidatedQuery } from '@core/middleware';
import { requireUserId, getParamId, getClientIp } from '@core/utils';

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

/**
 * Decode filename from latin1 to UTF-8 (multer encodes non-ASCII filenames as latin1)
 */
function decodeFilename(filename: string): string {
  try {
    return Buffer.from(filename, 'latin1').toString('utf-8');
  } catch {
    return filename;
  }
}

function requireKnowledgeBaseId(req: Request): string {
  const kbId = getParamId(req, 'id');
  if (!kbId || !isValidUuid(kbId)) {
    throw new AppError('VALIDATION_ERROR', 'Valid knowledge base ID is required', 400);
  }

  return kbId;
}

export const knowledgeBaseController = {
  /**
   * POST /api/knowledge-bases
   */
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const data = getValidatedBody<CreateKnowledgeBaseRequest>(res);
    const kb = await knowledgeBaseService.create(userId, data, getRequestContext(req));
    sendSuccessResponse(res, kb, HTTP_STATUS.CREATED);
  }),

  /**
   * GET /api/knowledge-bases
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const params = getValidatedQuery<KnowledgeBaseListParams>(res);
    const result = await knowledgeBaseService.list(userId, params);
    sendSuccessResponse(res, result);
  }),

  /**
   * GET /api/knowledge-bases/:id
   */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = requireKnowledgeBaseId(req);
    const kb = await knowledgeBaseService.getById(kbId, userId);
    sendSuccessResponse(res, kb);
  }),

  /**
   * PATCH /api/knowledge-bases/:id
   */
  update: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = requireKnowledgeBaseId(req);
    const data = getValidatedBody<UpdateKnowledgeBaseRequest>(res);
    const kb = await knowledgeBaseService.update(kbId, userId, data, getRequestContext(req));
    sendSuccessResponse(res, kb);
  }),

  /**
   * DELETE /api/knowledge-bases/:id
   */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = requireKnowledgeBaseId(req);
    await knowledgeBaseService.delete(kbId, userId, getRequestContext(req));
    sendSuccessResponse(res, { message: 'Knowledge base deleted successfully' });
  }),

  /**
   * POST /api/knowledge-bases/:id/documents
   */
  uploadDocument: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = requireKnowledgeBaseId(req);
    const file = req.file;

    if (!file) {
      throw new AppError('VALIDATION_ERROR', 'No file uploaded', 400);
    }

    const { title, description } = req.body as {
      title?: string;
      description?: string;
    };

    const document = await documentService.upload(
      userId,
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: decodeFilename(file.originalname),
        size: file.size,
      },
      { title, description, knowledgeBaseId: kbId },
      getRequestContext(req)
    );

    sendSuccessResponse(
      res,
      { document, message: 'Document uploaded successfully' },
      HTTP_STATUS.CREATED
    );
  }),

  /**
   * GET /api/knowledge-bases/:id/documents
   */
  listDocuments: asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const kbId = requireKnowledgeBaseId(req);
    const params = getValidatedQuery<DocumentListParams>(res);

    const result = await documentService.list(userId, { ...params, knowledgeBaseId: kbId });
    sendSuccessResponse(res, result);
  }),
};
