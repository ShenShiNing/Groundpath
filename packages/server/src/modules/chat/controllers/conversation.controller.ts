import type { Request, Response } from 'express';
import type {
  CreateConversationInput,
  UpdateConversationInput,
  ListConversationsInput,
  SearchConversationsInput,
} from '@groundpath/shared/schemas';
import { conversationService } from '../services/conversation.service';
import { messageService } from '../services/message.service';
import { sendSuccessResponse, asyncHandler } from '@core/errors';
import { getValidatedBody, getValidatedQuery } from '@core/middleware';

function paramAsString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0]! : value!;
}

export const conversationController = {
  /**
   * POST /api/chat/conversations - Create a new conversation
   */
  create: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const parsed = getValidatedBody<CreateConversationInput>(res);
    const conversation = await conversationService.create(userId, parsed);
    sendSuccessResponse(res, conversation, 201);
  }),

  /**
   * GET /api/chat/conversations - List conversations
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const parsed = getValidatedQuery<ListConversationsInput>(res);
    const conversations = await conversationService.list(userId, parsed);
    sendSuccessResponse(res, conversations);
  }),

  /**
   * GET /api/chat/conversations/search - Search conversations by message content
   */
  search: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const parsed = getValidatedQuery<SearchConversationsInput>(res);
    const result = await conversationService.search(userId, parsed);
    sendSuccessResponse(res, result);
  }),

  /**
   * GET /api/chat/conversations/:id - Get conversation with messages
   */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const id = paramAsString(req.params.id);
    const conversation = await conversationService.getById(userId, id);
    const messages = await messageService.getByConversation(id);
    sendSuccessResponse(res, { ...conversation, messages });
  }),

  /**
   * PATCH /api/chat/conversations/:id - Update conversation
   */
  update: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const id = paramAsString(req.params.id);
    const parsed = getValidatedBody<UpdateConversationInput>(res);
    const conversation = await conversationService.update(userId, id, parsed);
    sendSuccessResponse(res, conversation);
  }),

  /**
   * DELETE /api/chat/conversations/:id - Delete conversation
   */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const id = paramAsString(req.params.id);
    await conversationService.delete(userId, id);
    sendSuccessResponse(res, { message: 'Conversation deleted' });
  }),
};
