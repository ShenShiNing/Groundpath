import type { Request, Response } from 'express';
import type { SendMessageInput, ListMessagesInput } from '@groundpath/shared/schemas';
import { chatService } from '../services/chat.service';
import { messageService } from '../services/message.service';
import { sendSuccessResponse, handleError, asyncHandler } from '@core/errors';
import { getValidatedBody, getValidatedQuery } from '@core/middleware';

function paramAsString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]! : value!;
}

export const messageController = {
  /**
   * POST /api/chat/conversations/:id/messages - Send message (SSE streaming)
   */
  sendMessage: asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = req.user!.sub;
      const conversationId = paramAsString(req.params.id);
      const parsed = getValidatedBody<SendMessageInput>(res);

      await chatService.sendMessageWithSSE(res, {
        userId,
        conversationId,
        content: parsed.content,
        documentIds: parsed.documentIds,
        editedMessageId: parsed.editedMessageId,
      });
    } catch (error) {
      if (!res.headersSent) {
        handleError(error, res, 'Send message');
      }
    }
  }),

  /**
   * GET /api/chat/conversations/:id/messages - Get message history
   */
  listMessages: asyncHandler(async (req: Request, res: Response) => {
    const conversationId = paramAsString(req.params.id);
    const parsed = getValidatedQuery<ListMessagesInput>(res);

    const messages = await messageService.getByConversation(conversationId, parsed);
    sendSuccessResponse(res, messages);
  }),
};
