import { Router } from 'express';
import {
  createConversationSchema,
  listConversationsSchema,
  listMessagesSchema,
  searchConversationsSchema,
  sendMessageSchema,
  updateConversationSchema,
} from '@groundpath/shared/schemas';
import { authenticate, aiRateLimiter, validateBody, validateQuery } from '@core/middleware';
import { conversationController } from './controllers/conversation.controller';
import { messageController } from './controllers/message.controller';
import { requireConversationOwnership } from './public/ownership';

const router = Router();

// All chat routes require authentication
router.use(authenticate);

// Conversation endpoints
router.post(
  '/conversations',
  validateBody(createConversationSchema),
  conversationController.create
);
router.get('/conversations', validateQuery(listConversationsSchema), conversationController.list);
router.get(
  '/conversations/search',
  validateQuery(searchConversationsSchema),
  conversationController.search
);
router.get('/conversations/:id', conversationController.getById);
router.patch(
  '/conversations/:id',
  validateBody(updateConversationSchema),
  conversationController.update
);
router.delete('/conversations/:id', conversationController.delete);

// Message endpoints
router.post(
  '/conversations/:id/messages',
  aiRateLimiter,
  validateBody(sendMessageSchema),
  requireConversationOwnership(),
  messageController.sendMessage
);
router.get(
  '/conversations/:id/messages',
  validateQuery(listMessagesSchema),
  requireConversationOwnership(),
  messageController.listMessages
);

export default router;
