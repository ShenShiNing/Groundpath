import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dbMock,
  selectMock,
  deleteMock,
  listFromMock,
  listWhereMock,
  listOrderByMock,
  listLimitMock,
  listOffsetMock,
  recentFromMock,
  recentWhereMock,
  recentOrderByMock,
  recentLimitMock,
  lastFromMock,
  lastWhereMock,
  lastOrderByMock,
  lastLimitMock,
  targetFromMock,
  targetWhereMock,
  targetLimitMock,
  deleteWhereMock,
  ascMock,
  descMock,
  eqMock,
  gtMock,
  andMock,
  sqlMock,
  messagesMock,
} = vi.hoisted(() => {
  const listFrom = vi.fn();
  const listWhere = vi.fn();
  const listOrderBy = vi.fn();
  const listLimit = vi.fn();
  const listOffset = vi.fn();

  const recentFrom = vi.fn();
  const recentWhere = vi.fn();
  const recentOrderBy = vi.fn();
  const recentLimit = vi.fn();

  const lastFrom = vi.fn();
  const lastWhere = vi.fn();
  const lastOrderBy = vi.fn();
  const lastLimit = vi.fn();

  const targetFrom = vi.fn();
  const targetWhere = vi.fn();
  const targetLimit = vi.fn();

  const select = vi.fn();
  const deleteWhere = vi.fn();
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  const db = {
    select,
    delete: deleteFn,
  };

  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings,
    values,
  }));
  Object.assign(sql, {
    join: vi.fn((items: unknown[], separator: unknown) => ({
      type: 'sql.join',
      items,
      separator,
    })),
  });

  return {
    dbMock: db,
    selectMock: select,
    deleteMock: deleteFn,
    listFromMock: listFrom,
    listWhereMock: listWhere,
    listOrderByMock: listOrderBy,
    listLimitMock: listLimit,
    listOffsetMock: listOffset,
    recentFromMock: recentFrom,
    recentWhereMock: recentWhere,
    recentOrderByMock: recentOrderBy,
    recentLimitMock: recentLimit,
    lastFromMock: lastFrom,
    lastWhereMock: lastWhere,
    lastOrderByMock: lastOrderBy,
    lastLimitMock: lastLimit,
    targetFromMock: targetFrom,
    targetWhereMock: targetWhere,
    targetLimitMock: targetLimit,
    deleteWhereMock: deleteWhere,
    ascMock: vi.fn((value: unknown) => ({ type: 'asc', value })),
    descMock: vi.fn((value: unknown) => ({ type: 'desc', value })),
    eqMock: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    gtMock: vi.fn((left: unknown, right: unknown) => ({ type: 'gt', left, right })),
    andMock: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    sqlMock: sql,
    messagesMock: {
      id: 'messages.id',
      conversationId: 'messages.conversationId',
      role: 'messages.role',
      content: 'messages.content',
      metadata: 'messages.metadata',
      sequence: 'messages.sequence',
      createdAt: 'messages.createdAt',
    },
  };
});

vi.mock('drizzle-orm', () => ({
  and: andMock,
  asc: ascMock,
  count: vi.fn(),
  desc: descMock,
  eq: eqMock,
  gt: gtMock,
  inArray: vi.fn(),
  isNull: vi.fn(),
  sql: sqlMock,
}));

vi.mock('@core/db', () => ({
  db: dbMock,
}));

vi.mock('@core/db/db.utils', () => ({
  getDbContext: vi.fn((tx: unknown) => tx ?? dbMock),
}));

vi.mock('@core/db/schema/ai/messages.schema', () => ({
  messages: messagesMock,
}));

vi.mock('@core/db/schema/ai/conversations.schema', () => ({
  conversations: {
    id: 'conversations.id',
    userId: 'conversations.userId',
    knowledgeBaseId: 'conversations.knowledgeBaseId',
    title: 'conversations.title',
    deletedAt: 'conversations.deletedAt',
  },
}));

import { messageRepository } from '@modules/chat/repositories/message.repository';

describe('messageRepository ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMock.mockReset();
    deleteMock.mockClear();
    deleteWhereMock.mockReset();
  });

  it('orders conversation messages by stable sequence', async () => {
    selectMock.mockReturnValueOnce({ from: listFromMock });
    listFromMock.mockReturnValueOnce({ where: listWhereMock });
    listWhereMock.mockReturnValueOnce({ orderBy: listOrderByMock });
    listOrderByMock.mockReturnValueOnce({ limit: listLimitMock });
    listLimitMock.mockReturnValueOnce({ offset: listOffsetMock });
    listOffsetMock.mockResolvedValueOnce([{ id: 'msg-1' }, { id: 'msg-2' }]);

    const result = await messageRepository.listByConversation('conv-1', { limit: 20, offset: 5 });

    expect(ascMock).toHaveBeenCalledWith(messagesMock.sequence);
    expect(listOrderByMock).toHaveBeenCalledWith({ type: 'asc', value: messagesMock.sequence });
    expect(result).toEqual([{ id: 'msg-1' }, { id: 'msg-2' }]);
  });

  it('orders recent messages by descending stable sequence before reversing', async () => {
    selectMock.mockReturnValueOnce({ from: recentFromMock });
    recentFromMock.mockReturnValueOnce({ where: recentWhereMock });
    recentWhereMock.mockReturnValueOnce({ orderBy: recentOrderByMock });
    recentOrderByMock.mockReturnValueOnce({ limit: recentLimitMock });
    recentLimitMock.mockResolvedValueOnce([{ id: 'msg-3' }, { id: 'msg-2' }, { id: 'msg-1' }]);

    const result = await messageRepository.getRecentMessages('conv-1', 3);

    expect(descMock).toHaveBeenCalledWith(messagesMock.sequence);
    expect(recentOrderByMock).toHaveBeenCalledWith({ type: 'desc', value: messagesMock.sequence });
    expect(result).toEqual([{ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' }]);
  });

  it('gets the last message timestamp by stable sequence', async () => {
    const createdAt = new Date('2026-03-03T14:10:00.000Z');

    selectMock.mockReturnValueOnce({ from: lastFromMock });
    lastFromMock.mockReturnValueOnce({ where: lastWhereMock });
    lastWhereMock.mockReturnValueOnce({ orderBy: lastOrderByMock });
    lastOrderByMock.mockReturnValueOnce({ limit: lastLimitMock });
    lastLimitMock.mockResolvedValueOnce([{ createdAt }]);

    const result = await messageRepository.getLastMessageAt('conv-1');

    expect(descMock).toHaveBeenCalledWith(messagesMock.sequence);
    expect(lastOrderByMock).toHaveBeenCalledWith({ type: 'desc', value: messagesMock.sequence });
    expect(result).toBe(createdAt);
  });

  it('deletes messages after the target by stable sequence instead of createdAt', async () => {
    selectMock.mockReturnValueOnce({ from: targetFromMock });
    targetFromMock.mockReturnValueOnce({ where: targetWhereMock });
    targetWhereMock.mockReturnValueOnce({ limit: targetLimitMock });
    targetLimitMock.mockResolvedValueOnce([{ sequence: 42 }]);

    await messageRepository.deleteAfterMessage('conv-1', 'msg-42');

    expect(gtMock).toHaveBeenCalledWith(messagesMock.sequence, 42);
    expect(deleteWhereMock).toHaveBeenCalledWith({
      type: 'and',
      conditions: [
        { type: 'eq', left: messagesMock.conversationId, right: 'conv-1' },
        { type: 'gt', left: messagesMock.sequence, right: 42 },
      ],
    });
  });
});
