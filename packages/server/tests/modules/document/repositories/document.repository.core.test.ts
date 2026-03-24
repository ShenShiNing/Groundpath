import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dbMock,
  selectMock,
  countSelectFromMock,
  countSelectWhereMock,
  listSelectFromMock,
  listSelectWhereMock,
  listSelectOrderByMock,
  listSelectLimitMock,
  eqMock,
  andMock,
  isNullMock,
  isNotNullMock,
  likeMock,
  ascMock,
  descMock,
  countMock,
  documentsMock,
} = vi.hoisted(() => {
  const countSelectFrom = vi.fn();
  const countSelectWhere = vi.fn();
  const listSelectFrom = vi.fn();
  const listSelectWhere = vi.fn();
  const listSelectOrderBy = vi.fn();
  const listSelectLimit = vi.fn();
  const select = vi.fn();

  const db = {
    select,
  };

  return {
    dbMock: db,
    selectMock: select,
    countSelectFromMock: countSelectFrom,
    countSelectWhereMock: countSelectWhere,
    listSelectFromMock: listSelectFrom,
    listSelectWhereMock: listSelectWhere,
    listSelectOrderByMock: listSelectOrderBy,
    listSelectLimitMock: listSelectLimit,
    eqMock: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    andMock: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    isNullMock: vi.fn((value: unknown) => ({ type: 'isNull', value })),
    isNotNullMock: vi.fn((value: unknown) => ({ type: 'isNotNull', value })),
    likeMock: vi.fn((left: unknown, right: unknown) => ({ type: 'like', left, right })),
    ascMock: vi.fn((value: unknown) => ({ type: 'asc', value })),
    descMock: vi.fn((value: unknown) => ({ type: 'desc', value })),
    countMock: vi.fn(() => 'COUNT_SQL'),
    documentsMock: {
      id: 'documents.id',
      userId: 'documents.userId',
      knowledgeBaseId: 'documents.knowledgeBaseId',
      documentType: 'documents.documentType',
      title: 'documents.title',
      fileSize: 'documents.fileSize',
      createdAt: 'documents.createdAt',
      updatedAt: 'documents.updatedAt',
      deletedAt: 'documents.deletedAt',
    },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: eqMock,
  and: andMock,
  isNull: isNullMock,
  isNotNull: isNotNullMock,
  like: likeMock,
  asc: ascMock,
  desc: descMock,
  count: countMock,
  sql: vi.fn(),
}));

vi.mock('@core/db', () => ({
  db: dbMock,
}));

vi.mock('@core/db/db.utils', () => ({
  getDbContext: vi.fn((tx: unknown) => tx ?? dbMock),
  now: vi.fn(() => new Date()),
}));

vi.mock('@core/db/schema/document/documents.schema', () => ({
  documents: documentsMock,
}));

import { documentRepository } from '@modules/document/public/repositories';

const mockDocument = {
  id: 'doc-1',
  title: 'Doc 1',
};

function prepareListMocks() {
  selectMock
    .mockReturnValueOnce({ from: countSelectFromMock })
    .mockReturnValueOnce({ from: listSelectFromMock });

  countSelectFromMock.mockReturnValueOnce({ where: countSelectWhereMock });
  countSelectWhereMock.mockResolvedValueOnce([{ count: 1 }]);

  listSelectFromMock.mockReturnValueOnce({ where: listSelectWhereMock });
  listSelectWhereMock.mockReturnValueOnce({ orderBy: listSelectOrderByMock });
  listSelectOrderByMock.mockReturnValueOnce({ limit: listSelectLimitMock });
  listSelectLimitMock.mockResolvedValueOnce([mockDocument]);
}

describe('documentRepositoryCore list ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMock.mockReset();
    countSelectFromMock.mockReset();
    countSelectWhereMock.mockReset();
    listSelectFromMock.mockReset();
    listSelectWhereMock.mockReset();
    listSelectOrderByMock.mockReset();
    listSelectLimitMock.mockReset();
  });

  it('applies a stable secondary id sort for document lists', async () => {
    prepareListMocks();

    const result = await documentRepository.list('user-1', {
      pageSize: 20,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(descMock).toHaveBeenNthCalledWith(1, documentsMock.updatedAt);
    expect(descMock).toHaveBeenNthCalledWith(2, documentsMock.id);
    expect(listSelectOrderByMock).toHaveBeenCalledWith(
      { type: 'desc', value: documentsMock.updatedAt },
      { type: 'desc', value: documentsMock.id }
    );
    expect(listSelectLimitMock).toHaveBeenCalledWith(21);
    expect(result).toEqual({
      documents: [mockDocument],
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('applies a stable secondary id sort for trash lists', async () => {
    prepareListMocks();

    const result = await documentRepository.listDeleted('user-1', {
      pageSize: 10,
      sortBy: 'title',
      sortOrder: 'asc',
    });

    expect(ascMock).toHaveBeenNthCalledWith(1, documentsMock.title);
    expect(ascMock).toHaveBeenNthCalledWith(2, documentsMock.id);
    expect(listSelectOrderByMock).toHaveBeenCalledWith(
      { type: 'asc', value: documentsMock.title },
      { type: 'asc', value: documentsMock.id }
    );
    expect(listSelectLimitMock).toHaveBeenCalledWith(11);
    expect(result).toEqual({
      documents: [mockDocument],
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
  });
});
