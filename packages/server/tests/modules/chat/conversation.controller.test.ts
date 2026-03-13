import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  conversationService: {
    create: vi.fn(),
    list: vi.fn(),
    search: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    updateTitle: vi.fn(),
    delete: vi.fn(),
  },
  messageService: {
    getByConversation: vi.fn(),
  },
  sendSuccessResponse: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock('@modules/chat/services/conversation.service', () => ({
  conversationService: mocks.conversationService,
}));

vi.mock('@modules/chat/services/message.service', () => ({
  messageService: mocks.messageService,
}));

vi.mock('@core/errors', () => ({
  sendSuccessResponse: mocks.sendSuccessResponse,
  handleError: mocks.handleError,
}));

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

function createRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: {},
  } as unknown as Response;
}

describe('conversationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create should call service and return 201 response', async () => {
    const req = createReq({
      body: { title: 'My chat', knowledgeBaseId: '123e4567-e89b-12d3-a456-426614174000' },
    });
    const res = createRes();
    const conversation = { id: 'conv-1' };
    mocks.conversationService.create.mockResolvedValue(conversation);

    await conversationController.create(req, res);

    expect(mocks.conversationService.create).toHaveBeenCalledWith('user-1', req.body);
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, conversation, 201);
  });

  it('create should forward validation error to handleError', async () => {
    const req = createReq({ body: { title: '' } });
    const res = createRes();

    await conversationController.create(req, res);

    expect(mocks.conversationService.create).not.toHaveBeenCalled();
    expect(mocks.handleError).toHaveBeenCalledTimes(1);
    expect(mocks.handleError.mock.calls[0]![1]).toBe(res);
    expect(mocks.handleError.mock.calls[0]![2]).toBe('Create conversation');
  });

  it('list should parse query and return success response', async () => {
    const req = createReq({ query: { limit: '10', offset: '5' } });
    const res = createRes();
    const list = {
      items: [{ id: 'conv-1' }],
      pagination: { limit: 10, offset: 5, total: 1, hasMore: false },
    };
    mocks.conversationService.list.mockResolvedValue(list);

    await conversationController.list(req, res);

    expect(mocks.conversationService.list).toHaveBeenCalledWith('user-1', { limit: 10, offset: 5 });
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, list);
  });

  it('search should forward invalid query error', async () => {
    const req = createReq({ query: { query: 'a' } });
    const res = createRes();

    await conversationController.search(req, res);

    expect(mocks.conversationService.search).not.toHaveBeenCalled();
    expect(mocks.handleError).toHaveBeenCalledWith(expect.anything(), res, 'Search conversations');
  });

  it('getById should combine conversation and messages', async () => {
    const req = createReq({ params: { id: 'conv-1' } });
    const res = createRes();
    mocks.conversationService.getById.mockResolvedValue({ id: 'conv-1', title: 'Title' });
    mocks.messageService.getByConversation.mockResolvedValue([{ id: 'msg-1' }]);

    await conversationController.getById(req, res);

    expect(mocks.conversationService.getById).toHaveBeenCalledWith('user-1', 'conv-1');
    expect(mocks.messageService.getByConversation).toHaveBeenCalledWith('conv-1');
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, {
      id: 'conv-1',
      title: 'Title',
      messages: [{ id: 'msg-1' }],
    });
  });

  it('update should validate body and call update', async () => {
    const req = createReq({ params: { id: 'conv-1' }, body: { title: 'New title' } });
    const res = createRes();
    mocks.conversationService.update.mockResolvedValue({ id: 'conv-1', title: 'New title' });

    await conversationController.update(req, res);

    expect(mocks.conversationService.update).toHaveBeenCalledWith('user-1', 'conv-1', {
      title: 'New title',
    });
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, {
      id: 'conv-1',
      title: 'New title',
    });
  });

  it('delete should call service and return success message', async () => {
    const req = createReq({ params: { id: 'conv-1' } });
    const res = createRes();

    await conversationController.delete(req, res);

    expect(mocks.conversationService.delete).toHaveBeenCalledWith('user-1', 'conv-1');
    expect(mocks.sendSuccessResponse).toHaveBeenCalledWith(res, {
      message: 'Conversation deleted',
    });
  });
});
