import type { Request, Response, RequestHandler } from 'express';
import { requireResourceOwnership } from '@core/middleware';
import { getParamId } from '@core/utils';
import { conversationService } from '../services/conversation.service';

interface ConversationOwnershipOptions {
  resolveResourceId?: (req: Request, res: Response) => string | undefined;
}

export function requireConversationOwnership(
  options: ConversationOwnershipOptions = {}
): RequestHandler {
  return requireResourceOwnership({
    missingResourceMessage: 'Conversation ID is required',
    resolveResourceId: options.resolveResourceId ?? ((req) => getParamId(req, 'id')),
    resolveOwnedResource: ({ userId, resourceId }) =>
      conversationService.validateOwnership(userId, resourceId),
  });
}
