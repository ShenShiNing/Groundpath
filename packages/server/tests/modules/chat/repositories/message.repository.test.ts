import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dbMock,
  getDbContextMock,
  insertValuesMock,
  selectFromMock,
  selectWhereMock,
  selectLimitMock,
  selectOrderByMock,
  selectOffsetMock,
  deleteWhereMock,
  eqMock,
  gtMock,
  andMock,
  orMock,
  ascMock,
  descMock,
  inArrayMock,
  isNullMock,
  sqlMock,
  countMock,
  messagesMock,
  conversationsMock,
} = vi.hoisted(() => {
  const insertValues = vi.fn();
  const selectFrom = vi.fn();
  const selectWhere = vi.fn();
  const selectLimit = vi.fn();
  const selectOrderBy = vi.fn();
  const selectOffset = vi.fn();
  const deleteWhere = vi.fn();

  const db = {
    insert: vi.fn(() => ({
      values: insertValues,
    })),
    select: vi.fn(() => ({
      from: selectFrom,
    })),
    delete: vi.fn(() => ({
      where: deleteWhere,
    })),
  };

  return {
    dbMock: db,
    getDbContextMock: vi.fn((tx: unknown) => tx ?? db),
    insertValuesMock: insertValues,
    selectFromMock: selectFrom,
    selectWhereMock: selectWhere,
    selectLimitMock: selectLimit,
    selectOrderByMock: selectOrderBy,
    selectOffsetMock: selectOffset,
    deleteWhereMock: deleteWhere,
    eqMock: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    gtMock: vi.fn((left: unknown, right: unknown) => ({ type: 'gt', left, right })),
    andMock: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    orMock: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
    ascMock: vi.fn((value: unknown) => ({ type: 'asc', value })),
    descMock: vi.fn((value: unknown) => ({ type: 'desc', value })),
    inArrayMock: vi.fn((left: unknown, right: unknown[]) => ({ type: 'inArray', left, right })),
    isNullMock: vi.fn((value: unknown) => ({ type: 'isNull', value })),
    sqlMock: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: 'sql',
      strings: Array.from(strings),
      values,
    })),
    countMock: vi.fn(() => 'COUNT_SQL'),
    messagesMock: {
      id: 'messages.id',
      conversationId: 'messages.conversationId',
      role: 'messages.role',
      content: 'messages.content',
      metadata: 'messages.metadata',
      createdAt: 'messages.createdAt',
    },
    conversationsMock: {
      id: 'conversations.id',
      userId: 'conversations.userId',
      title: 'conversations.title',
      knowledgeBaseId: 'conversations.knowledgeBaseId',
      deletedAt: 'conversations.deletedAt',
    },
  };
});

vi.mock('drizzle-orm', () => ({
  and: andMock,
  asc: ascMock,
  count: countMock,
  desc: descMock,
  eq: eqMock,
  gt: gtMock,
  inArray: inArrayMock,
  isNull: isNullMock,
  or: orMock,
  sql: sqlMock,
}));

vi.mock('@core/db', () => ({
  db: dbMock,
}));

vi.mock('@core/db/db.utils', () => ({
  getDbContext: getDbContextMock,
}));

vi.mock('@core/db/schema/ai/messages.schema', () => ({
  messages: messagesMock,
}));

vi.mock('@core/db/schema/ai/conversations.schema', () => ({
  conversations: conversationsMock,
}));

import { messageRepository } from '@modules/chat/repositories/message.repository';

describe('messageRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    insertValuesMock.mockReset();
    selectFromMock.mockReset();
    selectWhereMock.mockReset();
    selectLimitMock.mockReset();
    selectOrderByMock.mockReset();
    selectOffsetMock.mockReset();
    deleteWhereMock.mockReset();
  });

  it('creates a generated millisecond createdAt when the caller omits it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T10:00:00.123Z'));

    const insertedRow = {
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello',
      metadata: null,
      createdAt: new Date('2026-04-05T10:00:00.123Z'),
    };

    insertValuesMock.mockResolvedValueOnce(undefined);
    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockReturnValueOnce({ limit: selectLimitMock });
    selectLimitMock.mockResolvedValueOnce([insertedRow]);

    const result = await messageRepository.create({
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello',
      metadata: null,
    });

    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg-1',
        createdAt: new Date('2026-04-05T10:00:00.123Z'),
      })
    );
    expect(result).toEqual(insertedRow);
  });

  it('lists conversation messages with createdAt and id as stable ordering keys', async () => {
    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockReturnValueOnce({ orderBy: selectOrderByMock });
    selectOrderByMock.mockReturnValueOnce({ limit: selectLimitMock });
    selectLimitMock.mockReturnValueOnce({ offset: selectOffsetMock });
    selectOffsetMock.mockResolvedValueOnce([]);

    await messageRepository.listByConversation('conv-1', { limit: 20, offset: 5 });

    expect(ascMock).toHaveBeenNthCalledWith(1, messagesMock.createdAt);
    expect(ascMock).toHaveBeenNthCalledWith(2, messagesMock.id);
    expect(selectOrderByMock).toHaveBeenCalledWith(
      { type: 'asc', value: messagesMock.createdAt },
      { type: 'asc', value: messagesMock.id }
    );
  });

  it('loads recent messages using descending createdAt and id before reversing', async () => {
    const older = {
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'Earlier',
      metadata: null,
      createdAt: new Date('2026-04-05T10:00:00.123Z'),
    };
    const newer = {
      id: 'msg-2',
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Later',
      metadata: null,
      createdAt: new Date('2026-04-05T10:00:00.456Z'),
    };

    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockReturnValueOnce({ orderBy: selectOrderByMock });
    selectOrderByMock.mockReturnValueOnce({ limit: selectLimitMock });
    selectLimitMock.mockResolvedValueOnce([newer, older]);

    const result = await messageRepository.getRecentMessages('conv-1', 2);

    expect(descMock).toHaveBeenNthCalledWith(1, messagesMock.createdAt);
    expect(descMock).toHaveBeenNthCalledWith(2, messagesMock.id);
    expect(result).toEqual([older, newer]);
  });

  it('deletes messages strictly after the target using createdAt then id', async () => {
    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockReturnValueOnce({ limit: selectLimitMock });
    selectLimitMock.mockResolvedValueOnce([
      {
        id: 'msg-2',
        createdAt: new Date('2026-04-05T10:00:00.123Z'),
      },
    ]);
    deleteWhereMock.mockResolvedValueOnce(undefined);

    await messageRepository.deleteAfterMessage('conv-1', 'msg-2');

    expect(orMock).toHaveBeenCalledWith(
      { type: 'gt', left: messagesMock.createdAt, right: new Date('2026-04-05T10:00:00.123Z') },
      {
        type: 'and',
        conditions: [
          { type: 'eq', left: messagesMock.createdAt, right: new Date('2026-04-05T10:00:00.123Z') },
          { type: 'gt', left: messagesMock.id, right: 'msg-2' },
        ],
      }
    );
    expect(deleteWhereMock).toHaveBeenCalledWith({
      type: 'and',
      conditions: [
        { type: 'eq', left: messagesMock.conversationId, right: 'conv-1' },
        {
          type: 'or',
          conditions: [
            {
              type: 'gt',
              left: messagesMock.createdAt,
              right: new Date('2026-04-05T10:00:00.123Z'),
            },
            {
              type: 'and',
              conditions: [
                {
                  type: 'eq',
                  left: messagesMock.createdAt,
                  right: new Date('2026-04-05T10:00:00.123Z'),
                },
                { type: 'gt', left: messagesMock.id, right: 'msg-2' },
              ],
            },
          ],
        },
      ],
    });
  });
});
