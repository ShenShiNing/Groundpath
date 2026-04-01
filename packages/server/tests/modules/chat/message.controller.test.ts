import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  chatService: {
    sendMessageWithSSE: vi.fn(),
  },
  messageService: {
    getByConversation: vi.fn(),
  },
  sendSuccessResponse: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock('@modules/chat/services/chat.service', () => ({
  chatService: mocks.chatService,
}));

vi.mock('@modules/chat/services/message.service', () => ({
  messageService: mocks.messageService,
}));

vi.mock('@core/errors', async () => {
  const actual = await vi.importActual<typeof import('@core/errors')>('@core/errors');
  return {
    ...actual,
    sendSuccessResponse: mocks.sendSuccessResponse,
    handleError: mocks.handleError,
  };
});

import { messageController } from '@modules/chat/controllers/message.controller';

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
    headersSent: false,
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

describe('messageController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendMessage should delegate SSE streaming with validated body', async () => {
    const validatedBody = {
      content: 'Hello',
      documentIds: ['123e4567-e89b-12d3-a456-426614174000'],
      editedMessageId: 'msg-1',
    };
    const req = createReq({
      params: { id: 'conv-1' },
      body: { content: 'raw body should be ignored' },
    });
    const res = createRes({
      locals: { validated: { body: validatedBody } },
    });
    const next = vi.fn() as unknown as NextFunction;

    await callController(messageController.sendMessage, req, res, next);

    expect(mocks.chatService.sendMessageWithSSE).toHaveBeenCalledWith(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hello',
      documentIds: ['123e4567-e89b-12d3-a456-426614174000'],
      editedMessageId: 'msg-1',
    });
    expect(mocks.handleError).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('sendMessage should call handleError when service rejects before headers are sent', async () => {
    const error = new Error('boom');
    const req = createReq({ params: { id: 'conv-1' } });
    const res = createRes({
      headersSent: false,
      locals: { validated: { body: { content: 'Hi' } } },
    });
    const next = vi.fn() as unknown as NextFunction;
    mocks.chatService.sendMessageWithSSE.mockRejectedValueOnce(error);

    await callController(messageController.sendMessage, req, res, next);

    expect(mocks.handleError).toHaveBeenCalledWith(error, res, 'Send message');
    expect(next).not.toHaveBeenCalled();
  });

  it('sendMessage should not call handleError when headers already sent', async () => {
    const req = createReq({ params: { id: 'conv-1' } });
    const res = createRes({
      headersSent: true,
      locals: { validated: { body: { content: 'Hi' } } },
    });
    const next = vi.fn() as unknown as NextFunction;
    mocks.chatService.sendMessageWithSSE.mockRejectedValueOnce(new Error('boom'));

    await callController(messageController.sendMessage, req, res, next);

    expect(mocks.handleError).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('listMessages should use validated query and return success response', async () => {
    const validatedQuery = { limit: 20, offset: 1 };
    const req = createReq({ params: { id: 'conv-1' }, query: { limit: '1', offset: '0' } });
    const res = createRes({
      locals: { validated: { query: validatedQuery } },
    });
    const next = vi.fn() as unknown as NextFunction;
    const messages = [{ id: 'msg-1' }];
    mocks.messageService.getByConversation.mockResolvedValue(messages);

    await callController(messageController.listMessages, req, res, next);

    expect(mocks.messageService.getByConversation).toHaveBeenCalledWith('conv-1', validatedQuery);
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, messages);
    expect(next).not.toHaveBeenCalled();
  });

  it('listMessages should forward service errors to next', async () => {
    const error = new Error('list failed');
    const req = createReq({ params: { id: 'conv-1' } });
    const res = createRes({
      locals: { validated: { query: { limit: 20, offset: 0 } } },
    });
    let nextError: unknown;
    const next = vi.fn((err?: unknown) => {
      nextError = err;
    }) as unknown as NextFunction;
    mocks.messageService.getByConversation.mockRejectedValueOnce(error);

    await callController(messageController.listMessages, req, res, next);

    expect(nextError).toBe(error);
    expect(mocks.handleError).not.toHaveBeenCalled();
  });
});
