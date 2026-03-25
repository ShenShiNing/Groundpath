import type { Request, Response, RequestHandler } from 'express';
import { requireResourceOwnership } from '@core/middleware';
import { Errors } from '@core/errors';
import { getParamId } from '@core/utils';
import { documentRepository } from './repositories';

interface DocumentOwnershipOptions {
  resolveResourceId?: (req: Request, res: Response) => string | undefined;
}

export function requireDocumentOwnership(options: DocumentOwnershipOptions = {}): RequestHandler {
  return requireResourceOwnership({
    resourceKey: 'document',
    missingResourceMessage: 'Document ID required',
    resolveResourceId: options.resolveResourceId ?? ((req) => getParamId(req, 'documentId')),
    resolveOwnedResource: async ({ userId, resourceId }) => {
      const document = await documentRepository.findByIdAndUser(resourceId, userId);
      if (!document) {
        throw Errors.notFound('Document');
      }
      return document;
    },
  });
}
