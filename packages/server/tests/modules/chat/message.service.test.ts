import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  messageRepository: {
    create: vi.fn(),
    listByConversation: vi.fn(),
    getRecentMessages: vi.fn(),
    updateMetadata: vi.fn(),
    countByConversation: vi.fn(),
  },
  uuidV4Mock: vi.fn(() => 'msg-uuid-001'),
}));

vi.mock('uuid', () => ({
  v4: mocks.uuidV4Mock,
}));

vi.mock('@modules/chat/repositories/message.repository', () => ({
  messageRepository: mocks.messageRepository,
}));

import { messageService } from '@modules/chat/services/message.service';

describe('messageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create message with generated id when id is missing', async () => {
    const createdAt = new Date('2026-03-03T13:00:00.000Z');
    mocks.messageRepository.create.mockResolvedValue({
      id: 'msg-uuid-001',
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello',
      metadata: null,
      createdAt,
    });

    const result = await messageService.create({
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello',
    });

    expect(mocks.messageRepository.create).toHaveBeenCalledWith({
      id: 'msg-uuid-001',
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello',
      metadata: null,
    });
    expect(result).toEqual({
      id: 'msg-uuid-001',
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello',
      metadata: null,
      createdAt,
    });
  });

  it('should preserve provided id and metadata on create', async () => {
    const createdAt = new Date('2026-03-03T13:10:00.000Z');
    const metadata = {
      citations: [
        {
          sourceType: 'chunk' as const,
          documentId: 'doc-1',
          documentTitle: 'Doc',
          chunkIndex: 0,
          content: 'Snippet',
        },
      ],
    };
    mocks.messageRepository.create.mockResolvedValue({
      id: 'custom-id',
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Answer',
      metadata,
      createdAt,
    });

    const result = await messageService.create({
      id: 'custom-id',
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Answer',
      metadata,
    });

    expect(mocks.messageRepository.create).toHaveBeenCalledWith({
      id: 'custom-id',
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Answer',
      metadata,
    });
    expect(result.metadata).toEqual(metadata);
  });

  it('should map listByConversation results', async () => {
    const createdAt = new Date('2026-03-03T13:20:00.000Z');
    mocks.messageRepository.listByConversation.mockResolvedValue([
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Q',
        metadata: null,
        createdAt,
      },
      {
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'A',
        metadata: { citations: [] },
        createdAt,
      },
    ]);

    const result = await messageService.getByConversation('conv-1', { limit: 50, offset: 10 });

    expect(mocks.messageRepository.listByConversation).toHaveBeenCalledWith('conv-1', {
      limit: 50,
      offset: 10,
    });
    expect(result).toHaveLength(2);
    expect(result[1]!.role).toBe('assistant');
  });

  it('should map recent messages for context', async () => {
    const createdAt = new Date('2026-03-03T13:30:00.000Z');
    mocks.messageRepository.getRecentMessages.mockResolvedValue([
      {
        id: 'msg-3',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Latest',
        metadata: null,
        createdAt,
      },
    ]);

    const result = await messageService.getRecentForContext('conv-1', 8);

    expect(mocks.messageRepository.getRecentMessages).toHaveBeenCalledWith('conv-1', 8);
    expect(result[0]!.content).toBe('Latest');
  });

  it('should delegate metadata update and message count', async () => {
    mocks.messageRepository.countByConversation.mockResolvedValue(42);

    await messageService.updateMetadata('msg-1', { citations: [], finalCitations: [] });
    const total = await messageService.count('conv-1');

    expect(mocks.messageRepository.updateMetadata).toHaveBeenCalledWith('msg-1', {
      citations: [],
      finalCitations: [],
    });
    expect(mocks.messageRepository.countByConversation).toHaveBeenCalledWith('conv-1');
    expect(total).toBe(42);
  });
});
