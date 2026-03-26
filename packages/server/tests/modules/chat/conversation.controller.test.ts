import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  conversationService: {
    create: vi.fn(),
    list: vi.fn(),
    search: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  messageService: {
    getByConversation: vi.fn(),
  },
  sendSuccessResponse: vi.fn(),
}));

vi.mock('@modules/chat/services/conversation.service', () => ({
  conversationService: mocks.conversationService,
}));

vi.mock('@modules/chat/services/message.service', () => ({
  messageService: mocks.messageService,
}));

vi.mock('@core/errors', async () => {
  const actual = await vi.importActual<typeof import('@core/errors')>('@core/errors');
  return {
    ...actual,
    sendSuccessResponse: mocks.sendSuccessResponse,
  };
});

import { conversationController } from '@modules/chat/controllers/conversation.controller';

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { sub: 'user-1' },
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as Request;
}

function createRes(overrides: Partial<Response> = {}): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: {},
    ...overrides,
  } as unknown as Response;
}

async function callController(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  handler(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));
}

describe('conversationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create should use validated body and return 201 response', async () => {
    const validatedBody = {
      title: 'My chat',
      knowledgeBaseId: '123e4567-e89b-12d3-a456-426614174000',
    };
    const req = createReq({ body: { title: 'raw body should be ignored' } });
    const res = createRes({
      locals: { validated: { body: validatedBody } },
    });
    const next = vi.fn() as unknown as NextFunction;
    const conversation = { id: 'conv-1' };
    mocks.conversationService.create.mockResolvedValue(conversation);

    await callController(conversationController.create, req, res, next);

    expect(mocks.conversationService.create).toHaveBeenCalledWith('user-1', validatedBody);
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, conversation, 201);
    expect(next).not.toHaveBeenCalled();
  });

  it('create should forward service errors to next', async () => {
    const error = new Error('create failed');
    const req = createReq();
    const res = createRes({
      locals: { validated: { body: { title: 'My chat' } } },
    });
    let nextError: unknown;
    const next = vi.fn((err?: unknown) => {
      nextError = err;
    }) as unknown as NextFunction;
    mocks.conversationService.create.mockRejectedValue(error);

    await callController(conversationController.create, req, res, next);

    expect(nextError).toBe(error);
    expect(mocks.sendSuccessResponse).not.toHaveBeenCalled();
  });

  it('list should use validated query and return success response', async () => {
    const validatedQuery = { limit: 10, offset: 5 };
    const req = createReq({ query: { limit: '1', offset: '0' } });
    const res = createRes({
      locals: { validated: { query: validatedQuery } },
    });
    const next = vi.fn() as unknown as NextFunction;
    const list = {
      items: [{ id: 'conv-1' }],
      pagination: { limit: 10, offset: 5, total: 1, hasMore: false },
    };
    mocks.conversationService.list.mockResolvedValue(list);

    await callController(conversationController.list, req, res, next);

    expect(mocks.conversationService.list).toHaveBeenCalledWith('user-1', validatedQuery);
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, list);
    expect(next).not.toHaveBeenCalled();
  });

  it('search should use validated query and return success response', async () => {
    const validatedQuery = { query: 'hello', limit: 20, offset: 0 };
    const req = createReq({ query: { query: 'raw' } });
    const res = createRes({
      locals: { validated: { query: validatedQuery } },
    });
    const next = vi.fn() as unknown as NextFunction;
    const result = {
      items: [{ conversationId: 'conv-1' }],
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
    };
    mocks.conversationService.search.mockResolvedValue(result);

    await callController(conversationController.search, req, res, next);

    expect(mocks.conversationService.search).toHaveBeenCalledWith('user-1', validatedQuery);
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, result);
    expect(next).not.toHaveBeenCalled();
  });

  it('getById should combine conversation and messages', async () => {
    const req = createReq({ params: { id: 'conv-1' } });
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;
    mocks.conversationService.getById.mockResolvedValue({ id: 'conv-1', title: 'Title' });
    mocks.messageService.getByConversation.mockResolvedValue([{ id: 'msg-1' }]);

    await callController(conversationController.getById, req, res, next);

    expect(mocks.conversationService.getById).toHaveBeenCalledWith('user-1', 'conv-1');
    expect(mocks.messageService.getByConversation).toHaveBeenCalledWith('conv-1');
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, {
      id: 'conv-1',
      title: 'Title',
      messages: [{ id: 'msg-1' }],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('update should use validated body and call update', async () => {
    const validatedBody = { title: 'New title' };
    const req = createReq({ params: { id: 'conv-1' }, body: { title: 'raw' } });
    const res = createRes({
      locals: { validated: { body: validatedBody } },
    });
    const next = vi.fn() as unknown as NextFunction;
    mocks.conversationService.update.mockResolvedValue({ id: 'conv-1', title: 'New title' });

    await callController(conversationController.update, req, res, next);

    expect(mocks.conversationService.update).toHaveBeenCalledWith(
      'user-1',
      'conv-1',
      validatedBody
    );
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, {
      id: 'conv-1',
      title: 'New title',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('delete should call service and return success message', async () => {
    const req = createReq({ params: { id: 'conv-1' } });
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await callController(conversationController.delete, req, res, next);

    expect(mocks.conversationService.delete).toHaveBeenCalledWith('user-1', 'conv-1');
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, {
      message: 'Conversation deleted',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
