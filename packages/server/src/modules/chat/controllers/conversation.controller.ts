import type { Request, Response } from 'express';
import {
  createConversationSchema,
  updateConversationSchema,
  listConversationsSchema,
  searchConversationsSchema,
} from '@groundpath/shared/schemas';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';
import { sendSuccessResponse, handleError } from '@core/errors';

function paramAsString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]! : value!;
}

export const conversationController = {
  /**
   * POST /api/chat/conversations - Create a new conversation
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = createConversationSchema.parse(req.body);
      const conversation = await conversationService.create(userId, parsed);
      sendSuccessResponse(res, conversation, 201);
    } catch (error) {
      handleError(error, res, 'Create conversation');
    }
  },

  /**
   * GET /api/chat/conversations - List conversations
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = listConversationsSchema.parse(req.query);
      const conversations = await conversationService.list(userId, parsed);
      sendSuccessResponse(res, conversations);
    } catch (error) {
      handleError(error, res, 'List conversations');
    }
  },

  /**
   * GET /api/chat/conversations/search - Search conversations by message content
   */
  async search(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const parsed = searchConversationsSchema.parse(req.query);
      const result = await conversationService.search(userId, parsed);
      sendSuccessResponse(res, result);
    } catch (error) {
      handleError(error, res, 'Search conversations');
    }
  },

  /**
   * GET /api/chat/conversations/:id - Get conversation with messages
   */
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const id = paramAsString(req.params.id);
      const conversation = await conversationService.getById(userId, id);
      const messages = await messageService.getByConversation(id);
      sendSuccessResponse(res, { ...conversation, messages });
    } catch (error) {
      handleError(error, res, 'Get conversation');
    }
  },

  /**
   * PATCH /api/chat/conversations/:id - Update conversation
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const id = paramAsString(req.params.id);
      const parsed = updateConversationSchema.parse(req.body);
      const conversation = await conversationService.update(userId, id, parsed);
      sendSuccessResponse(res, conversation);
    } catch (error) {
      handleError(error, res, 'Update conversation');
    }
  },

  /**
   * DELETE /api/chat/conversations/:id - Delete conversation
   */
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.sub;
      const id = paramAsString(req.params.id);
      await conversationService.delete(userId, id);
      sendSuccessResponse(res, { message: 'Conversation deleted' });
    } catch (error) {
      handleError(error, res, 'Delete conversation');
    }
  },
};
