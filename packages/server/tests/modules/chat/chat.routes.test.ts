import { describe, expect, it, vi } from 'vitest';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  aiRateLimiterMock,
  conversationControllerMock,
  messageControllerMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    aiRateLimiterMock: vi.fn(),
    conversationControllerMock: {
      create: vi.fn(),
      list: vi.fn(),
      search: vi.fn(),
      getById: vi.fn(),
      fork: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    messageControllerMock: {
      sendMessage: vi.fn(),
      listMessages: vi.fn(),
    },
  };
});

vi.mock('express', () => ({
  Router: RouterMock,
}));

vi.mock('@core/middleware', () => ({
  authenticate: authenticateMock,
  aiRateLimiter: aiRateLimiterMock,
}));

vi.mock('@modules/chat/controllers/conversation.controller', () => ({
  conversationController: conversationControllerMock,
}));

vi.mock('@modules/chat/controllers/message.controller', () => ({
  messageController: messageControllerMock,
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
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/conversations/:id/fork',
      conversationControllerMock.fork
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
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/conversations/:id/messages',
      aiRateLimiterMock,
      messageControllerMock.sendMessage
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/conversations/:id/messages',
      messageControllerMock.listMessages
    );
  });
});
