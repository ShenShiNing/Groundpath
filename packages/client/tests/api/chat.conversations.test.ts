import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  unwrapResponse: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  apiClient: {
    get: mocks.get,
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
});
