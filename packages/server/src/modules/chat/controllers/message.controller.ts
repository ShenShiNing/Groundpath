import type { Request, Response } from 'express';
import { sendMessageSchema, listMessagesSchema } from '@groundpath/shared/schemas';
import { chatService } from '../services/chat.service';
import { messageService } from '../services/message.service';
import { sendSuccessResponse, handleError } from '@core/errors';

function paramAsString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]! : value!;
}

export const messageController = {
  /**
   * POST /api/chat/conversations/:id/messages - Send message (SSE streaming)
   */
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const conversationId = paramAsString(req.params.id);
      const parsed = sendMessageSchema.parse(req.body);

      // Stream response via SSE
      await chatService.sendMessageWithSSE(res, {
        userId,
        conversationId,
        content: parsed.content,
        documentIds: parsed.documentIds,
        editedMessageId: parsed.editedMessageId,
      });
    } catch (error) {
      // If headers haven't been sent, we can still return JSON error
      if (!res.headersSent) {
        handleError(error, res, 'Send message');
      }
      // Otherwise, error was handled in chatService via SSE
    }
  },

  /**
   * GET /api/chat/conversations/:id/messages - Get message history
   */
  async listMessages(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = paramAsString(req.params.id);
      const parsed = listMessagesSchema.parse(req.query);

      const messages = await messageService.getByConversation(conversationId, parsed);
      sendSuccessResponse(res, messages);
    } catch (error) {
      handleError(error, res, 'List messages');
    }
  },
};
