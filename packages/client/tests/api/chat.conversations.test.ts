import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  unwrapResponse: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
  },
  unwrapResponse: mocks.unwrapResponse,
  fetchStreamWithAuth: vi.fn(),
  parseSSEStream: vi.fn(),
  createSSEDispatcher: vi.fn(),
}));

import { conversationApi, chatApi } from '@/api/chat';

describe('conversationApi.list / chatApi.listConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should request paginated conversation list and return full payload', async () => {
    const responsePayload = {
      items: [{ id: 'conv-1', title: 'Chat 1' }],
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
    };
    mocks.get.mockResolvedValue({ data: { success: true, data: responsePayload } });
    mocks.unwrapResponse.mockReturnValue(responsePayload);

    const result = await conversationApi.list({ knowledgeBaseId: 'kb-1', limit: 20, offset: 0 });

    expect(mocks.get).toHaveBeenCalledWith('/api/chat/conversations', {
      params: { knowledgeBaseId: 'kb-1', limit: 20, offset: 0 },
    });
    expect(result).toEqual(responsePayload);
  });

  it('should keep legacy listConversations compatibility by returning items only', async () => {
    const responsePayload = {
      items: [
        { id: 'conv-1', title: 'Chat 1' },
        { id: 'conv-2', title: 'Chat 2' },
      ],
      pagination: { limit: 20, offset: 0, total: 2, hasMore: false },
    };
    mocks.get.mockResolvedValue({ data: { success: true, data: responsePayload } });
    mocks.unwrapResponse.mockReturnValue(responsePayload);

    const result = await chatApi.listConversations('kb-1');

    expect(result).toEqual(responsePayload.items);
  });

  it('should fork a conversation before the requested message', async () => {
    const forkedConversation = {
      id: 'conv-branch-1',
      knowledgeBaseId: 'kb-1',
      messages: [],
    };
    mocks.post.mockResolvedValue({ data: { success: true, data: forkedConversation } });
    mocks.unwrapResponse.mockReturnValue(forkedConversation);

    const result = await conversationApi.fork('conv-1', { beforeMessageId: 'msg-user-2' });

    expect(mocks.post).toHaveBeenCalledWith('/api/chat/conversations/conv-1/fork', {
      beforeMessageId: 'msg-user-2',
    });
    expect(result).toEqual(forkedConversation);
  });
});
