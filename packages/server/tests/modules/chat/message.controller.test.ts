import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

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

vi.mock('@core/errors', () => ({
  sendSuccessResponse: mocks.sendSuccessResponse,
  handleError: mocks.handleError,
}));

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

describe('messageController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendMessage should delegate SSE streaming', async () => {
    const req = createReq({
      params: { id: 'conv-1' },
      body: { content: 'Hello', documentIds: ['123e4567-e89b-12d3-a456-426614174000'] },
    });
    const res = createRes();

    await messageController.sendMessage(req, res);

    expect(mocks.chatService.sendMessageWithSSE).toHaveBeenCalledWith(res, {
      userId: 'user-1',
      conversationId: 'conv-1',
      content: 'Hello',
      documentIds: ['123e4567-e89b-12d3-a456-426614174000'],
    });
  });

  it('sendMessage should call handleError for invalid payload when headers not sent', async () => {
    const req = createReq({ params: { id: 'conv-1' }, body: { content: '' } });
    const res = createRes({ headersSent: false });

    await messageController.sendMessage(req, res);

    expect(mocks.chatService.sendMessageWithSSE).not.toHaveBeenCalled();
    expect(mocks.handleError).toHaveBeenCalledWith(expect.anything(), res, 'Send message');
  });

  it('sendMessage should not call handleError when headers already sent', async () => {
    const req = createReq({ params: { id: 'conv-1' }, body: { content: 'Hi' } });
    const res = createRes({ headersSent: true });
    mocks.chatService.sendMessageWithSSE.mockRejectedValueOnce(new Error('boom'));

    await messageController.sendMessage(req, res);

    expect(mocks.handleError).not.toHaveBeenCalled();
  });

  it('listMessages should validate query and return success response', async () => {
    const req = createReq({ params: { id: 'conv-1' }, query: { limit: '20', offset: '1' } });
    const res = createRes();
    const messages = [{ id: 'msg-1' }];
    mocks.messageService.getByConversation.mockResolvedValue(messages);

    await messageController.listMessages(req, res);

    expect(mocks.messageService.getByConversation).toHaveBeenCalledWith('conv-1', {
      limit: 20,
      offset: 1,
    });
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, messages);
  });

  it('listMessages should forward query validation errors', async () => {
    const req = createReq({ params: { id: 'conv-1' }, query: { limit: '0' } });
    const res = createRes();

    await messageController.listMessages(req, res);

    expect(mocks.messageService.getByConversation).not.toHaveBeenCalled();
    expect(mocks.handleError).toHaveBeenCalledWith(expect.anything(), res, 'List messages');
  });
});
