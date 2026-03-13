import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_ERROR_CODES } from '@knowledge-agent/shared/constants';

const mocks = vi.hoisted(() => ({
  conversationRepository: {
    create: vi.fn(),
    findByIdAndUser: vi.fn(),
    listByUser: vi.fn(),
    countByUser: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
  messageRepository: {
    getStatsForConversations: vi.fn(),
    searchByContent: vi.fn(),
    listByConversation: vi.fn(),
    createMany: vi.fn(),
  },
  withTransaction: vi.fn(async (callback: (tx: { id: string }) => Promise<unknown>) =>
    callback({ id: 'tx-1' })
  ),
  uuidV4Mock: vi.fn(() => 'conv-uuid-001'),
}));

vi.mock('uuid', () => ({
  v4: mocks.uuidV4Mock,
}));

vi.mock('@modules/chat/repositories/conversation.repository', () => ({
  conversationRepository: mocks.conversationRepository,
}));

vi.mock('@modules/chat/repositories/message.repository', () => ({
  messageRepository: mocks.messageRepository,
}));

vi.mock('@core/db/db.utils', () => ({
  withTransaction: mocks.withTransaction,
}));

import { conversationService } from '@modules/chat/services/conversation.service';

describe('conversationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create conversation with default title', async () => {
    const createdAt = new Date('2026-03-03T12:00:00.000Z');
    mocks.conversationRepository.create.mockResolvedValue({
      id: 'conv-uuid-001',
      userId: 'user-1',
      knowledgeBaseId: null,
      title: 'New Conversation',
      createdAt,
      updatedAt: createdAt,
    });

    const result = await conversationService.create('user-1', {});

    expect(mocks.conversationRepository.create).toHaveBeenCalledWith({
      id: 'conv-uuid-001',
      userId: 'user-1',
      knowledgeBaseId: null,
      title: 'New Conversation',
      createdBy: 'user-1',
    });
    expect(result).toEqual({
      id: 'conv-uuid-001',
      userId: 'user-1',
      knowledgeBaseId: null,
      title: 'New Conversation',
      createdAt,
      updatedAt: createdAt,
    });
  });

  it('should create conversation with custom title and knowledge base', async () => {
    const createdAt = new Date('2026-03-03T12:10:00.000Z');
    mocks.conversationRepository.create.mockResolvedValue({
      id: 'conv-uuid-001',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      title: 'My KB Chat',
      createdAt,
      updatedAt: createdAt,
    });

    await conversationService.create('user-1', { title: 'My KB Chat', knowledgeBaseId: 'kb-1' });

    expect(mocks.conversationRepository.create).toHaveBeenCalledWith({
      id: 'conv-uuid-001',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      title: 'My KB Chat',
      createdBy: 'user-1',
    });
  });

  it('should throw CONVERSATION_NOT_FOUND when getById misses', async () => {
    mocks.conversationRepository.findByIdAndUser.mockResolvedValue(undefined);

    await expect(conversationService.getById('user-1', 'conv-404')).rejects.toMatchObject({
      code: CHAT_ERROR_CODES.CONVERSATION_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('should list conversations with aggregated message stats', async () => {
    const createdAt = new Date('2026-03-03T12:00:00.000Z');
    const updatedAt = new Date('2026-03-03T12:30:00.000Z');
    const lastMessageAt = new Date('2026-03-03T12:29:00.000Z');

    mocks.conversationRepository.listByUser.mockResolvedValue([
      {
        id: 'conv-1',
        userId: 'user-1',
        knowledgeBaseId: null,
        title: 'First',
        createdAt,
        updatedAt,
      },
      {
        id: 'conv-2',
        userId: 'user-1',
        knowledgeBaseId: 'kb-1',
        title: 'Second',
        createdAt,
        updatedAt,
      },
    ]);
    mocks.conversationRepository.countByUser.mockResolvedValue(2);
    mocks.messageRepository.getStatsForConversations.mockResolvedValue(
      new Map([
        ['conv-1', { count: 5, lastMessageAt }],
        ['conv-2', { count: 0, lastMessageAt: null }],
      ])
    );

    const result = await conversationService.list('user-1', { limit: 20, offset: 0 });

    expect(mocks.conversationRepository.listByUser).toHaveBeenCalledWith('user-1', {
      limit: 20,
      offset: 0,
    });
    expect(mocks.conversationRepository.countByUser).toHaveBeenCalledWith('user-1', undefined);
    expect(mocks.messageRepository.getStatsForConversations).toHaveBeenCalledWith([
      'conv-1',
      'conv-2',
    ]);
    expect(result).toEqual({
      items: [
        {
          id: 'conv-1',
          title: 'First',
          knowledgeBaseId: null,
          messageCount: 5,
          lastMessageAt,
          createdAt,
        },
        {
          id: 'conv-2',
          title: 'Second',
          knowledgeBaseId: 'kb-1',
          messageCount: 0,
          lastMessageAt: null,
          createdAt,
        },
      ],
      pagination: {
        limit: 20,
        offset: 0,
        total: 2,
        hasMore: false,
      },
    });
  });

  it('should return empty list without querying stats when no conversation', async () => {
    mocks.conversationRepository.listByUser.mockResolvedValue([]);
    mocks.conversationRepository.countByUser.mockResolvedValue(0);

    const result = await conversationService.list('user-1');

    expect(result).toEqual({
      items: [],
      pagination: {
        limit: 20,
        offset: 0,
        total: 0,
        hasMore: false,
      },
    });
    expect(mocks.conversationRepository.countByUser).toHaveBeenCalledWith('user-1', undefined);
    expect(mocks.messageRepository.getStatsForConversations).not.toHaveBeenCalled();
  });

  it('should update title when conversation exists', async () => {
    const createdAt = new Date('2026-03-03T12:00:00.000Z');
    const updatedAt = new Date('2026-03-03T12:40:00.000Z');

    mocks.conversationRepository.findByIdAndUser.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      title: 'Old',
      knowledgeBaseId: null,
      createdAt,
      updatedAt: createdAt,
    });
    mocks.conversationRepository.update.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      title: 'New title',
      knowledgeBaseId: null,
      createdAt,
      updatedAt,
    });

    const result = await conversationService.updateTitle('user-1', 'conv-1', 'New title');

    expect(mocks.conversationRepository.update).toHaveBeenCalledWith('conv-1', {
      title: 'New title',
      updatedBy: 'user-1',
    });
    expect(result.title).toBe('New title');
    expect(result.updatedAt).toBe(updatedAt);
  });

  it('should throw when update target conversation does not exist', async () => {
    mocks.conversationRepository.findByIdAndUser.mockResolvedValue(undefined);

    await expect(
      conversationService.updateTitle('user-1', 'conv-404', 'New')
    ).rejects.toMatchObject({
      code: CHAT_ERROR_CODES.CONVERSATION_NOT_FOUND,
      statusCode: 404,
    });
    expect(mocks.conversationRepository.update).not.toHaveBeenCalled();
  });

  it('should soft-delete existing conversation', async () => {
    mocks.conversationRepository.findByIdAndUser.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
    });

    await conversationService.delete('user-1', 'conv-1');

    expect(mocks.conversationRepository.softDelete).toHaveBeenCalledWith('conv-1', 'user-1');
  });

  it('should throw when deleting non-existing conversation', async () => {
    mocks.conversationRepository.findByIdAndUser.mockResolvedValue(undefined);

    await expect(conversationService.delete('user-1', 'conv-404')).rejects.toMatchObject({
      code: CHAT_ERROR_CODES.CONVERSATION_NOT_FOUND,
      statusCode: 404,
    });
    expect(mocks.conversationRepository.softDelete).not.toHaveBeenCalled();
  });

  it('should validate ownership success and failure', async () => {
    mocks.conversationRepository.findByIdAndUser.mockResolvedValueOnce({
      id: 'conv-ok',
      userId: 'user-1',
    });
    const found = await conversationService.validateOwnership('user-1', 'conv-ok');
    expect(found.id).toBe('conv-ok');

    mocks.conversationRepository.findByIdAndUser.mockResolvedValueOnce(undefined);
    await expect(conversationService.validateOwnership('user-1', 'conv-404')).rejects.toMatchObject(
      {
        code: CHAT_ERROR_CODES.CONVERSATION_NOT_FOUND,
        statusCode: 404,
      }
    );
  });

  it('should fork a conversation before the target user message', async () => {
    const createdAt = new Date('2026-03-03T12:00:00.000Z');
    const updatedAt = new Date('2026-03-03T12:30:00.000Z');
    const sourceMessages = [
      {
        id: 'msg-user-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'First question',
        metadata: null,
        createdAt,
      },
      {
        id: 'msg-assistant-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'First answer',
        metadata: { stopReason: 'answered' },
        createdAt: new Date('2026-03-03T12:01:00.000Z'),
      },
      {
        id: 'msg-user-2',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Second question',
        metadata: null,
        createdAt: new Date('2026-03-03T12:02:00.000Z'),
      },
    ];

    mocks.conversationRepository.findByIdAndUser.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      title: 'Original title',
      createdAt,
      updatedAt,
    });
    mocks.conversationRepository.create.mockResolvedValue({
      id: 'conv-uuid-001',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      title: 'Original title',
      createdAt,
      updatedAt,
    });
    mocks.messageRepository.listByConversation.mockResolvedValue(sourceMessages);
    mocks.messageRepository.createMany.mockResolvedValue([
      {
        id: 'fork-msg-user-1',
        conversationId: 'conv-uuid-001',
        role: 'user',
        content: 'First question',
        metadata: null,
        createdAt,
      },
      {
        id: 'fork-msg-assistant-1',
        conversationId: 'conv-uuid-001',
        role: 'assistant',
        content: 'First answer',
        metadata: { stopReason: 'answered' },
        createdAt: new Date('2026-03-03T12:01:00.000Z'),
      },
    ]);
    mocks.uuidV4Mock
      .mockReturnValueOnce('conv-uuid-001')
      .mockReturnValueOnce('fork-msg-user-1')
      .mockReturnValueOnce('fork-msg-assistant-1');

    const result = await conversationService.fork('user-1', 'conv-1', {
      beforeMessageId: 'msg-user-2',
    });

    expect(mocks.messageRepository.listByConversation).toHaveBeenCalledWith('conv-1');
    expect(mocks.conversationRepository.create).toHaveBeenCalledWith(
      {
        id: 'conv-uuid-001',
        userId: 'user-1',
        knowledgeBaseId: 'kb-1',
        title: 'Original title',
        createdBy: 'user-1',
      },
      { id: 'tx-1' }
    );
    expect(mocks.messageRepository.createMany).toHaveBeenCalledWith(
      [
        {
          id: 'fork-msg-user-1',
          conversationId: 'conv-uuid-001',
          role: 'user',
          content: 'First question',
          metadata: null,
          createdAt,
        },
        {
          id: 'fork-msg-assistant-1',
          conversationId: 'conv-uuid-001',
          role: 'assistant',
          content: 'First answer',
          metadata: { stopReason: 'answered' },
          createdAt: new Date('2026-03-03T12:01:00.000Z'),
        },
      ],
      { id: 'tx-1' }
    );
    expect(result).toEqual({
      id: 'conv-uuid-001',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      title: 'Original title',
      createdAt,
      updatedAt,
      messages: [
        {
          id: 'fork-msg-user-1',
          conversationId: 'conv-uuid-001',
          role: 'user',
          content: 'First question',
          metadata: null,
          createdAt,
        },
        {
          id: 'fork-msg-assistant-1',
          conversationId: 'conv-uuid-001',
          role: 'assistant',
          content: 'First answer',
          metadata: { stopReason: 'answered' },
          createdAt: new Date('2026-03-03T12:01:00.000Z'),
        },
      ],
    });
  });

  it('should reject fork when the message is missing or not editable', async () => {
    const createdAt = new Date('2026-03-03T12:00:00.000Z');

    mocks.conversationRepository.findByIdAndUser.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      knowledgeBaseId: 'kb-1',
      title: 'Original title',
      createdAt,
      updatedAt: createdAt,
    });
    mocks.messageRepository.listByConversation.mockResolvedValue([
      {
        id: 'msg-assistant-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'First answer',
        metadata: null,
        createdAt,
      },
    ]);

    await expect(
      conversationService.fork('user-1', 'conv-1', { beforeMessageId: 'missing-msg' })
    ).rejects.toMatchObject({
      code: CHAT_ERROR_CODES.MESSAGE_NOT_FOUND,
      statusCode: 404,
    });

    await expect(
      conversationService.fork('user-1', 'conv-1', { beforeMessageId: 'msg-assistant-1' })
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('should generate readable title with truncation and fallback', () => {
    expect(conversationService.generateTitle('  Hello    world  ')).toBe('Hello world');
    expect(
      conversationService.generateTitle(
        'This title is intentionally very long to verify that truncation works as expected'
      )
    ).toBe('This title is intentionally very long to verify...');
    expect(conversationService.generateTitle('     ')).toBe('New Conversation');
  });
});
