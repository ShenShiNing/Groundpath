import type { Request, Response, RequestHandler } from 'express';
import { AppError } from '@core/errors/app-error';
import { requireResourceOwnership } from '@core/middleware';
import { getParamId } from '@core/utils';
import { knowledgeBaseService } from './management';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireKnowledgeBaseParamId(req: Request): string {
  const knowledgeBaseId = getParamId(req, 'id');
  if (!knowledgeBaseId || !UUID_REGEX.test(knowledgeBaseId)) {
    throw new AppError('VALIDATION_ERROR', 'Valid knowledge base ID is required', 400);
  }
  return knowledgeBaseId;
}

interface KnowledgeBaseOwnershipOptions {
  resolveResourceId?: (req: Request, res: Response) => string | undefined;
}

export function requireKnowledgeBaseOwnership(
  options: KnowledgeBaseOwnershipOptions = {}
): RequestHandler {
  return requireResourceOwnership({
    resourceKey: 'knowledgeBase',
    missingResourceMessage: 'Knowledge base ID is required',
    resolveResourceId: options.resolveResourceId ?? ((req) => requireKnowledgeBaseParamId(req)),
    resolveOwnedResource: ({ userId, resourceId }) =>
      knowledgeBaseService.validateOwnership(resourceId, userId),
  });
}
