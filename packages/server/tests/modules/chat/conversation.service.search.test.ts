import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_ERROR_CODES } from '@groundpath/shared/constants';

const mocks = vi.hoisted(() => ({
  conversationRepository: {
    create: vi.fn(),
    findByIdAndUser: vi.fn(),
    listByUser: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
  messageRepository: {
    getStatsForConversations: vi.fn(),
    searchByContent: vi.fn(),
  },
}));

vi.mock('@modules/chat/repositories/conversation.repository', () => ({
  conversationRepository: mocks.conversationRepository,
}));

vi.mock('@modules/chat/repositories/message.repository', () => ({
  messageRepository: mocks.messageRepository,
}));

import { conversationService } from '@modules/chat/services/conversation.service';

describe('conversationService.search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject invalid query', async () => {
    await expect(
      conversationService.search('user-1', {
        query: 'a',
      })
    ).rejects.toMatchObject({
      code: CHAT_ERROR_CODES.CHAT_SEARCH_INVALID_QUERY,
      statusCode: 400,
    });

    expect(mocks.messageRepository.searchByContent).not.toHaveBeenCalled();
  });

  it('should return paginated search results', async () => {
    const now = new Date('2026-03-03T10:20:30.000Z');
    mocks.messageRepository.searchByContent.mockResolvedValue({
      items: [
        {
          conversationId: 'conv-1',
          conversationTitle: 'AI Notes',
          knowledgeBaseId: null,
          messageId: 'msg-1',
          role: 'assistant',
          snippet: 'This is a match',
          matchedAt: now,
          score: 2.1,
        },
      ],
      total: 23,
    });

    const result = await conversationService.search('user-1', {
      query: '  match ',
      limit: 10,
      offset: 10,
    });

    expect(mocks.messageRepository.searchByContent).toHaveBeenCalledWith('user-1', {
      query: 'match',
      knowledgeBaseId: undefined,
      limit: 10,
      offset: 10,
    });
    expect(result).toEqual({
      items: [
        {
          conversationId: 'conv-1',
          conversationTitle: 'AI Notes',
          knowledgeBaseId: null,
          messageId: 'msg-1',
          role: 'assistant',
          snippet: 'This is a match',
          matchedAt: now,
          score: 2.1,
        },
      ],
      pagination: {
        limit: 10,
        offset: 10,
        total: 23,
        hasMore: true,
      },
    });
  });
});
