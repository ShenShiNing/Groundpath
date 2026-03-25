import { describe, expect, it, vi } from 'vitest';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  aiRateLimiterMock,
  validateBodyMock,
  validateQueryMock,
  conversationControllerMock,
  requireConversationOwnershipMock,
  conversationOwnershipMiddlewareMock,
  messageControllerMock,
  sendMessageSchemaMock,
  listMessagesSchemaMock,
  sendMessageValidatorMock,
  listMessagesValidatorMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  const sendMessageValidator = vi.fn();
  const listMessagesValidator = vi.fn();
  const conversationOwnershipMiddleware = vi.fn();

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    aiRateLimiterMock: vi.fn(),
    validateBodyMock: vi.fn(() => sendMessageValidator),
    validateQueryMock: vi.fn(() => listMessagesValidator),
    conversationControllerMock: {
      create: vi.fn(),
      list: vi.fn(),
      search: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    requireConversationOwnershipMock: vi.fn(() => conversationOwnershipMiddleware),
    conversationOwnershipMiddlewareMock: conversationOwnershipMiddleware,
    messageControllerMock: {
      sendMessage: vi.fn(),
      listMessages: vi.fn(),
    },
    sendMessageSchemaMock: { type: 'send-message-schema' },
    listMessagesSchemaMock: { type: 'list-messages-schema' },
    sendMessageValidatorMock: sendMessageValidator,
    listMessagesValidatorMock: listMessagesValidator,
  };
});

vi.mock('express', () => ({
  Router: RouterMock,
}));

vi.mock('@core/middleware', () => ({
  authenticate: authenticateMock,
  aiRateLimiter: aiRateLimiterMock,
  validateBody: validateBodyMock,
  validateQuery: validateQueryMock,
}));

vi.mock('@modules/chat/controllers/conversation.controller', () => ({
  conversationController: conversationControllerMock,
}));

vi.mock('@modules/chat/controllers/message.controller', () => ({
  messageController: messageControllerMock,
}));

vi.mock('@modules/chat/public/ownership', () => ({
  requireConversationOwnership: requireConversationOwnershipMock,
}));

vi.mock('@groundpath/shared/schemas', () => ({
  sendMessageSchema: sendMessageSchemaMock,
  listMessagesSchema: listMessagesSchemaMock,
}));

import chatRoutes from '@modules/chat/chat.routes';

describe('chat.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(chatRoutes).toBe(mockRouter);
  });

  it('should register authentication middleware first', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(authenticateMock);
  });

  it('should register conversation endpoints', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/conversations',
      conversationControllerMock.create
    );
    expect(mockRouter.get).toHaveBeenCalledWith('/conversations', conversationControllerMock.list);
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/conversations/search',
      conversationControllerMock.search
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/conversations/:id',
      conversationControllerMock.getById
    );
    expect(mockRouter.patch).toHaveBeenCalledWith(
      '/conversations/:id',
      conversationControllerMock.update
    );
    expect(mockRouter.delete).toHaveBeenCalledWith(
      '/conversations/:id',
      conversationControllerMock.delete
    );

    const getCalls = mockRouter.get.mock.calls.map((call) => call[0]);
    expect(getCalls).toEqual([
      '/conversations',
      '/conversations/search',
      '/conversations/:id',
      '/conversations/:id/messages',
    ]);
  });

  it('should register message endpoints', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(sendMessageSchemaMock);
    expect(validateQueryMock).toHaveBeenCalledWith(listMessagesSchemaMock);
    expect(requireConversationOwnershipMock).toHaveBeenCalledTimes(2);

    expect(mockRouter.post).toHaveBeenCalledWith(
      '/conversations/:id/messages',
      aiRateLimiterMock,
      sendMessageValidatorMock,
      conversationOwnershipMiddlewareMock,
      messageControllerMock.sendMessage
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/conversations/:id/messages',
      listMessagesValidatorMock,
      conversationOwnershipMiddlewareMock,
      messageControllerMock.listMessages
    );
  });
});
