import { Router } from 'express';
import { authenticate } from '@shared/middleware/auth.middleware';
import { conversationController } from './controllers/conversation.controller';
import { messageController } from './controllers/message.controller';

const router = Router();

// All chat routes require authentication
router.use(authenticate);

// Conversation endpoints
router.post('/conversations', conversationController.create);
router.get('/conversations', conversationController.list);
router.get('/conversations/:id', conversationController.getById);
router.patch('/conversations/:id', conversationController.update);
router.delete('/conversations/:id', conversationController.delete);

// Message endpoints
router.post('/conversations/:id/messages', messageController.sendMessage);
router.get('/conversations/:id/messages', messageController.listMessages);

export default router;
