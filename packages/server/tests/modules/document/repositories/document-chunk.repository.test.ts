import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dbMock,
  selectMock,
  latestBuildSelectFromMock,
  latestBuildSelectWhereMock,
  latestBuildSelectOrderByMock,
  latestBuildSelectLimitMock,
  countSelectFromMock,
  countSelectWhereMock,
  eqMock,
  andMock,
  descMock,
  inArrayMock,
  countMock,
  documentChunksMock,
  documentIndexVersionsMock,
  documentsMock,
} = vi.hoisted(() => {
  const latestBuildSelectFrom = vi.fn();
  const latestBuildSelectWhere = vi.fn();
  const latestBuildSelectOrderBy = vi.fn();
  const latestBuildSelectLimit = vi.fn();
  const countSelectFrom = vi.fn();
  const countSelectWhere = vi.fn();
  const select = vi.fn();

  return {
    dbMock: { select },
    selectMock: select,
    latestBuildSelectFromMock: latestBuildSelectFrom,
    latestBuildSelectWhereMock: latestBuildSelectWhere,
    latestBuildSelectOrderByMock: latestBuildSelectOrderBy,
    latestBuildSelectLimitMock: latestBuildSelectLimit,
    countSelectFromMock: countSelectFrom,
    countSelectWhereMock: countSelectWhere,
    eqMock: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
    andMock: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
    descMock: vi.fn((value: unknown) => ({ type: 'desc', value })),
    inArrayMock: vi.fn((left: unknown, right: unknown[]) => ({ type: 'inArray', left, right })),
    countMock: vi.fn(() => 'COUNT_SQL'),
    documentChunksMock: {
      id: 'documentChunks.id',
      documentId: 'documentChunks.documentId',
      version: 'documentChunks.version',
      indexVersionId: 'documentChunks.indexVersionId',
      chunkIndex: 'documentChunks.chunkIndex',
    },
    documentIndexVersionsMock: {
      id: 'documentIndexVersions.id',
      documentId: 'documentIndexVersions.documentId',
      documentVersion: 'documentIndexVersions.documentVersion',
      builtAt: 'documentIndexVersions.builtAt',
    },
    documentsMock: {
      id: 'documents.id',
      activeIndexVersionId: 'documents.activeIndexVersionId',
    },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: eqMock,
  and: andMock,
  desc: descMock,
  inArray: inArrayMock,
  count: countMock,
}));

vi.mock('@core/db', () => ({
  db: dbMock,
}));

vi.mock('@core/db/db.utils', () => ({
  getDbContext: vi.fn((tx: unknown) => tx ?? dbMock),
}));

vi.mock('@core/db/schema/document/document-chunks.schema', () => ({
  documentChunks: documentChunksMock,
}));

vi.mock('@core/db/schema/document/document-index-versions.schema', () => ({
  documentIndexVersions: documentIndexVersionsMock,
}));

vi.mock('@core/db/schema/document/documents.schema', () => ({
  documents: documentsMock,
}));

import { documentChunkRepository } from '@modules/document/repositories/document-chunk.repository';

function prepareLatestBuildQuery(result: Array<{ indexVersionId: string }>) {
  selectMock.mockReturnValueOnce({ from: latestBuildSelectFromMock });
  latestBuildSelectFromMock.mockReturnValueOnce({ where: latestBuildSelectWhereMock });
  latestBuildSelectWhereMock.mockReturnValueOnce({ orderBy: latestBuildSelectOrderByMock });
  latestBuildSelectOrderByMock.mockReturnValueOnce({ limit: latestBuildSelectLimitMock });
  latestBuildSelectLimitMock.mockResolvedValueOnce(result);
}

function prepareCountQuery(result: Array<{ count: number }>) {
  selectMock.mockReturnValueOnce({ from: countSelectFromMock });
  countSelectFromMock.mockReturnValueOnce({ where: countSelectWhereMock });
  countSelectWhereMock.mockResolvedValueOnce(result);
}

describe('documentChunkRepository counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectMock.mockReset();
    latestBuildSelectFromMock.mockReset();
    latestBuildSelectWhereMock.mockReset();
    latestBuildSelectOrderByMock.mockReset();
    latestBuildSelectLimitMock.mockReset();
    countSelectFromMock.mockReset();
    countSelectWhereMock.mockReset();
  });

  it('returns 0 for countByDocumentAndVersion when no build exists', async () => {
    prepareLatestBuildQuery([]);

    const result = await documentChunkRepository.countByDocumentAndVersion('doc-1', 2);

    expect(result).toBe(0);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(countMock).not.toHaveBeenCalled();
  });

  it('uses COUNT(*) for countByDocumentAndVersion after resolving the latest build', async () => {
    prepareLatestBuildQuery([{ indexVersionId: 'index-1' }]);
    prepareCountQuery([{ count: 3 }]);

    const result = await documentChunkRepository.countByDocumentAndVersion('doc-1', 2);

    expect(result).toBe(3);
    expect(countMock).toHaveBeenCalledTimes(1);
    expect(selectMock).toHaveBeenNthCalledWith(2, { count: 'COUNT_SQL' });
  });

  it('uses COUNT(*) for countByActiveIndexVersion and falls back to 0', async () => {
    prepareCountQuery([]);

    const result = await documentChunkRepository.countByActiveIndexVersion('doc-1', 'index-1');

    expect(result).toBe(0);
    expect(countMock).toHaveBeenCalledTimes(1);
    expect(selectMock).toHaveBeenCalledWith({ count: 'COUNT_SQL' });
  });

  it('uses COUNT(*) for countByIndexVersionId', async () => {
    prepareCountQuery([{ count: 5 }]);

    const result = await documentChunkRepository.countByIndexVersionId('index-1');

    expect(result).toBe(5);
    expect(countMock).toHaveBeenCalledTimes(1);
    expect(selectMock).toHaveBeenCalledWith({ count: 'COUNT_SQL' });
  });
});
