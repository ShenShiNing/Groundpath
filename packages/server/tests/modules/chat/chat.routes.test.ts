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
  createConversationSchemaMock,
  listConversationsSchemaMock,
  searchConversationsSchemaMock,
  updateConversationSchemaMock,
  sendMessageSchemaMock,
  listMessagesSchemaMock,
  createConversationValidatorMock,
  listConversationsValidatorMock,
  searchConversationsValidatorMock,
  updateConversationValidatorMock,
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

  const createConversationSchema = { type: 'create-conversation-schema' };
  const listConversationsSchema = { type: 'list-conversations-schema' };
  const searchConversationsSchema = { type: 'search-conversations-schema' };
  const updateConversationSchema = { type: 'update-conversation-schema' };
  const sendMessageSchema = { type: 'send-message-schema' };
  const listMessagesSchema = { type: 'list-messages-schema' };

  const createConversationValidator = vi.fn();
  const listConversationsValidator = vi.fn();
  const searchConversationsValidator = vi.fn();
  const updateConversationValidator = vi.fn();
  const sendMessageValidator = vi.fn();
  const listMessagesValidator = vi.fn();
  const conversationOwnershipMiddleware = vi.fn();

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    aiRateLimiterMock: vi.fn(),
    validateBodyMock: vi.fn((schema: unknown) => {
      if (schema === createConversationSchema) return createConversationValidator;
      if (schema === updateConversationSchema) return updateConversationValidator;
      if (schema === sendMessageSchema) return sendMessageValidator;
      return vi.fn();
    }),
    validateQueryMock: vi.fn((schema: unknown) => {
      if (schema === listConversationsSchema) return listConversationsValidator;
      if (schema === searchConversationsSchema) return searchConversationsValidator;
      if (schema === listMessagesSchema) return listMessagesValidator;
      return vi.fn();
    }),
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
    createConversationSchemaMock: createConversationSchema,
    listConversationsSchemaMock: listConversationsSchema,
    searchConversationsSchemaMock: searchConversationsSchema,
    updateConversationSchemaMock: updateConversationSchema,
    sendMessageSchemaMock: sendMessageSchema,
    listMessagesSchemaMock: listMessagesSchema,
    createConversationValidatorMock: createConversationValidator,
    listConversationsValidatorMock: listConversationsValidator,
    searchConversationsValidatorMock: searchConversationsValidator,
    updateConversationValidatorMock: updateConversationValidator,
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
  createConversationSchema: createConversationSchemaMock,
  listConversationsSchema: listConversationsSchemaMock,
  searchConversationsSchema: searchConversationsSchemaMock,
  updateConversationSchema: updateConversationSchemaMock,
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

  it('should register conversation endpoints with validators', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(createConversationSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(updateConversationSchemaMock);
    expect(validateQueryMock).toHaveBeenCalledWith(listConversationsSchemaMock);
    expect(validateQueryMock).toHaveBeenCalledWith(searchConversationsSchemaMock);

    expect(mockRouter.post).toHaveBeenCalledWith(
      '/conversations',
      createConversationValidatorMock,
      conversationControllerMock.create
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/conversations',
      listConversationsValidatorMock,
      conversationControllerMock.list
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/conversations/search',
      searchConversationsValidatorMock,
      conversationControllerMock.search
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/conversations/:id',
      conversationControllerMock.getById
    );
    expect(mockRouter.patch).toHaveBeenCalledWith(
      '/conversations/:id',
      updateConversationValidatorMock,
      conversationControllerMock.update
    );
    expect(mockRouter.delete).toHaveBeenCalledWith(
      '/conversations/:id',
      conversationControllerMock.delete
    );
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
