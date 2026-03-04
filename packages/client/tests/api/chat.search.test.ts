import { describe, expect, it, vi, beforeEach } from 'vitest';

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

import { conversationApi } from '@/api/chat';

describe('conversationApi.search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call search endpoint with query params', async () => {
    const responsePayload = {
      items: [],
      pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
    };
    mocks.get.mockResolvedValue({ data: { success: true, data: responsePayload } });
    mocks.unwrapResponse.mockReturnValue(responsePayload);

    const result = await conversationApi.search({
      query: 'vector db',
      limit: 20,
      offset: 0,
    });

    expect(mocks.get).toHaveBeenCalledWith('/api/chat/conversations/search', {
      params: {
        query: 'vector db',
        limit: 20,
        offset: 0,
      },
    });
    expect(result).toEqual(responsePayload);
  });
});
