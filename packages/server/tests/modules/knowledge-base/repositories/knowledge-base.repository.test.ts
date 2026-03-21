import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dbMock,
  insertValuesMock,
  selectFromMock,
  selectWhereMock,
  selectLimitMock,
  selectOrderByMock,
  selectOffsetMock,
  updateSetMock,
  updateWhereMock,
  executeMock,
  eqMock,
  andMock,
  isNullMock,
  sqlMock,
  countMock,
  relationsMock,
  getDbContextMock,
  nowMock,
  knowledgeBasesMock,
} = vi.hoisted(() => {
  const insertValues = vi.fn();
  const selectFrom = vi.fn();
  const selectWhere = vi.fn();
  const selectLimit = vi.fn();
  const selectOrderBy = vi.fn();
  const selectOffset = vi.fn();
  const updateSet = vi.fn();
  const updateWhere = vi.fn();

  const db = {
    insert: vi.fn(() => ({
      values: insertValues,
    })),
    select: vi.fn(() => ({
      from: selectFrom,
    })),
    update: vi.fn(() => ({
      set: updateSet,
    })),
    execute: vi.fn(),
  };

  return {
    dbMock: db,
    insertValuesMock: insertValues,
    selectFromMock: selectFrom,
    selectWhereMock: selectWhere,
    selectLimitMock: selectLimit,
    selectOrderByMock: selectOrderBy,
    selectOffsetMock: selectOffset,
    updateSetMock: updateSet,
    updateWhereMock: updateWhere,
    executeMock: db.execute,
    eqMock: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    andMock: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    isNullMock: vi.fn((value: unknown) => ({ type: 'isNull', value })),
    sqlMock: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: 'sql',
      strings: Array.from(strings),
      values,
    })),
    countMock: vi.fn(() => 'COUNT_SQL'),
    relationsMock: vi.fn(() => ({})),
    getDbContextMock: vi.fn((tx: unknown) => tx ?? db),
    nowMock: vi.fn(() => 'NOW_SQL'),
    knowledgeBasesMock: {
      id: 'kb.id',
      userId: 'kb.userId',
      deletedAt: 'kb.deletedAt',
      createdAt: 'kb.createdAt',
      documentCount: 'kb.documentCount',
      totalChunks: 'kb.totalChunks',
    },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: eqMock,
  and: andMock,
  isNull: isNullMock,
  sql: sqlMock,
  count: countMock,
  relations: relationsMock,
}));

vi.mock('@core/db', () => ({
  db: dbMock,
}));

vi.mock('@core/db/db.utils', () => ({
  now: nowMock,
  getDbContext: getDbContextMock,
}));

vi.mock('@core/db/schema/document/knowledge-bases.schema', () => ({
  knowledgeBases: knowledgeBasesMock,
}));

vi.mock('@core/db/schema/document/documents.schema', () => ({
  documents: {
    knowledgeBaseId: 'doc.knowledgeBaseId',
    deletedAt: 'doc.deletedAt',
    chunkCount: 'doc.chunkCount',
  },
}));

import { knowledgeBaseRepository } from '@modules/knowledge-base/repositories/knowledge-base.repository';

const now = new Date('2026-02-17T00:00:00.000Z');

const mockKnowledgeBase = {
  id: 'kb-1',
  userId: 'user-1',
  name: 'KB 1',
  description: 'desc',
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  documentCount: 2,
  totalChunks: 10,
  createdBy: 'user-1',
  createdAt: now,
  updatedBy: 'user-1',
  updatedAt: now,
  deletedBy: null,
  deletedAt: null,
};

describe('knowledgeBaseRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertValuesMock.mockReset();
    selectFromMock.mockReset();
    selectWhereMock.mockReset();
    selectLimitMock.mockReset();
    selectOrderByMock.mockReset();
    selectOffsetMock.mockReset();
    updateSetMock.mockReset();
    updateWhereMock.mockReset();
    executeMock.mockReset();
  });

  it('should create knowledge base and return inserted record', async () => {
    const payload: Parameters<typeof knowledgeBaseRepository.create>[0] = {
      id: 'kb-1',
      userId: 'user-1',
      name: 'KB 1',
      description: 'desc',
      embeddingProvider: 'openai',
      embeddingModel: 'text-embedding-3-small',
      embeddingDimensions: 1536,
      createdBy: 'user-1',
      updatedBy: 'user-1',
    };

    insertValuesMock.mockResolvedValueOnce(undefined);
    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockReturnValueOnce({ limit: selectLimitMock });
    selectLimitMock.mockResolvedValueOnce([mockKnowledgeBase]);

    const result = await knowledgeBaseRepository.create(payload);

    expect(dbMock.insert).toHaveBeenCalledWith(knowledgeBasesMock);
    expect(insertValuesMock).toHaveBeenCalledWith(payload);
    expect(eqMock).toHaveBeenCalledWith(knowledgeBasesMock.id, payload.id);
    expect(selectLimitMock).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockKnowledgeBase);
  });

  it('should find knowledge base by id with non-deleted condition', async () => {
    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockReturnValueOnce({ limit: selectLimitMock });
    selectLimitMock.mockResolvedValueOnce([mockKnowledgeBase]);

    const result = await knowledgeBaseRepository.findById('kb-1');

    expect(eqMock).toHaveBeenCalledWith(knowledgeBasesMock.id, 'kb-1');
    expect(isNullMock).toHaveBeenCalledWith(knowledgeBasesMock.deletedAt);
    expect(andMock).toHaveBeenCalledTimes(1);
    expect(selectLimitMock).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockKnowledgeBase);
  });

  it('should return undefined when findById has no record', async () => {
    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockReturnValueOnce({ limit: selectLimitMock });
    selectLimitMock.mockResolvedValueOnce([]);

    const result = await knowledgeBaseRepository.findById('missing');

    expect(result).toBeUndefined();
  });

  it('should find knowledge base by id and user with ownership condition', async () => {
    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockReturnValueOnce({ limit: selectLimitMock });
    selectLimitMock.mockResolvedValueOnce([mockKnowledgeBase]);

    const result = await knowledgeBaseRepository.findByIdAndUser('kb-1', 'user-1');

    expect(eqMock).toHaveBeenCalledWith(knowledgeBasesMock.id, 'kb-1');
    expect(eqMock).toHaveBeenCalledWith(knowledgeBasesMock.userId, 'user-1');
    expect(isNullMock).toHaveBeenCalledWith(knowledgeBasesMock.deletedAt);
    expect(andMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockKnowledgeBase);
  });

  it('should lock knowledge base row by id and user inside a transaction', async () => {
    const tx = {
      execute: vi.fn().mockResolvedValueOnce([[{ id: 'kb-1' }]]),
    };

    const result = await knowledgeBaseRepository.lockByIdAndUser('kb-1', 'user-1', tx as never);

    expect(result).toBe(true);
    expect(tx.execute).toHaveBeenCalledWith(expect.objectContaining({ type: 'sql' }));
  });

  it('should list knowledge bases by user ordered by creation time', async () => {
    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockReturnValueOnce({ orderBy: selectOrderByMock });
    selectOrderByMock.mockReturnValueOnce({ limit: selectLimitMock });
    selectLimitMock.mockReturnValueOnce({ offset: selectOffsetMock });
    selectOffsetMock.mockResolvedValueOnce([mockKnowledgeBase]);

    const result = await knowledgeBaseRepository.listByUser('user-1');

    expect(eqMock).toHaveBeenCalledWith(knowledgeBasesMock.userId, 'user-1');
    expect(isNullMock).toHaveBeenCalledWith(knowledgeBasesMock.deletedAt);
    expect(andMock).toHaveBeenCalledTimes(1);
    expect(selectOrderByMock).toHaveBeenCalledWith(knowledgeBasesMock.createdAt);
    expect(selectLimitMock).toHaveBeenCalledWith(20);
    expect(selectOffsetMock).toHaveBeenCalledWith(0);
    expect(result).toEqual([mockKnowledgeBase]);
  });

  it('should update knowledge base and return refreshed record', async () => {
    const patch: Parameters<typeof knowledgeBaseRepository.update>[1] = {
      name: 'Renamed',
      description: 'updated',
      updatedBy: 'user-2',
    };

    const updatedRecord = { ...mockKnowledgeBase, ...patch };

    updateSetMock.mockReturnValueOnce({ where: updateWhereMock });
    updateWhereMock.mockResolvedValueOnce(undefined);
    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockReturnValueOnce({ limit: selectLimitMock });
    selectLimitMock.mockResolvedValueOnce([updatedRecord]);

    const result = await knowledgeBaseRepository.update('kb-1', patch);

    expect(dbMock.update).toHaveBeenCalledWith(knowledgeBasesMock);
    expect(updateSetMock).toHaveBeenCalledWith(patch);
    expect(eqMock).toHaveBeenCalledWith(knowledgeBasesMock.id, 'kb-1');
    expect(result).toEqual(updatedRecord);
  });

  it('should soft delete knowledge base with now() and deletedBy', async () => {
    updateSetMock.mockReturnValueOnce({ where: updateWhereMock });
    updateWhereMock.mockResolvedValueOnce(undefined);
    nowMock.mockReturnValueOnce('NOW_SQL');

    await knowledgeBaseRepository.softDelete('kb-1', 'deleter-1');

    expect(nowMock).toHaveBeenCalledTimes(1);
    expect(updateSetMock).toHaveBeenCalledWith({
      deletedAt: 'NOW_SQL',
      deletedBy: 'deleter-1',
    });
    expect(eqMock).toHaveBeenCalledWith(knowledgeBasesMock.id, 'kb-1');
  });

  it('should increment document count using sql expression in tx context', async () => {
    const txUpdateWhereMock = vi.fn().mockResolvedValueOnce(undefined);
    const txUpdateSetMock = vi.fn().mockReturnValueOnce({ where: txUpdateWhereMock });
    const txUpdateMock = vi.fn().mockReturnValueOnce({ set: txUpdateSetMock });
    const txContext = { update: txUpdateMock };
    const tx = { id: 'tx-1' };

    getDbContextMock.mockReturnValueOnce(txContext);

    await knowledgeBaseRepository.incrementDocumentCount('kb-1', -2, tx as never);

    expect(getDbContextMock).toHaveBeenCalledWith(tx);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(sqlMock.mock.calls[0]?.[1]).toBe(knowledgeBasesMock.documentCount);
    expect(sqlMock.mock.calls[0]?.[2]).toBe(-2);
    expect(txUpdateSetMock).toHaveBeenCalledWith({
      documentCount: expect.objectContaining({ type: 'sql' }),
    });
    expect(eqMock).toHaveBeenCalledWith(knowledgeBasesMock.id, 'kb-1');
  });

  it('should increment total chunks using sql expression in tx context', async () => {
    const txUpdateWhereMock = vi.fn().mockResolvedValueOnce(undefined);
    const txUpdateSetMock = vi.fn().mockReturnValueOnce({ where: txUpdateWhereMock });
    const txUpdateMock = vi.fn().mockReturnValueOnce({ set: txUpdateSetMock });
    const txContext = { update: txUpdateMock };

    getDbContextMock.mockReturnValueOnce(txContext);

    await knowledgeBaseRepository.incrementTotalChunks('kb-1', 5);

    expect(getDbContextMock).toHaveBeenCalledWith(undefined);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(sqlMock.mock.calls[0]?.[1]).toBe(knowledgeBasesMock.totalChunks);
    expect(sqlMock.mock.calls[0]?.[2]).toBe(5);
    expect(txUpdateSetMock).toHaveBeenCalledWith({
      totalChunks: expect.objectContaining({ type: 'sql' }),
    });
    expect(eqMock).toHaveBeenCalledWith(knowledgeBasesMock.id, 'kb-1');
  });

  it('should update counters with only provided fields', async () => {
    updateSetMock.mockReturnValueOnce({ where: updateWhereMock });
    updateWhereMock.mockResolvedValueOnce(undefined);

    await knowledgeBaseRepository.updateCounters('kb-1', { totalChunks: 99 });

    expect(updateSetMock).toHaveBeenCalledWith({ totalChunks: 99 });
    expect(eqMock).toHaveBeenCalledWith(knowledgeBasesMock.id, 'kb-1');
  });

  it('should list all non-deleted knowledge bases', async () => {
    selectFromMock.mockReturnValueOnce({ where: selectWhereMock });
    selectWhereMock.mockResolvedValueOnce([mockKnowledgeBase]);

    const result = await knowledgeBaseRepository.listAll();

    expect(isNullMock).toHaveBeenCalledWith(knowledgeBasesMock.deletedAt);
    expect(result).toEqual([mockKnowledgeBase]);
  });
});
