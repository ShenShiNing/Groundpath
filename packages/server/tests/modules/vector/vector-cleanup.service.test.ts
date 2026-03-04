import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getQdrantClientMock,
  purgeDeletedVectorsMock,
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  getQdrantClientMock: vi.fn(),
  purgeDeletedVectorsMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@modules/vector/qdrant.client', () => ({
  getQdrantClient: getQdrantClientMock,
}));

vi.mock('@modules/vector/vector.repository', () => ({
  vectorRepository: {
    purgeDeletedVectors: purgeDeletedVectorsMock,
  },
}));

vi.mock('@shared/logger', () => ({
  createLogger: vi.fn(() => ({
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  })),
}));

import { vectorCleanupService } from '@modules/vector/vector-cleanup.service';

describe('vector-cleanup.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should purge deleted vectors from all collections', async () => {
    getQdrantClientMock.mockReturnValue({
      getCollections: vi.fn().mockResolvedValue({
        collections: [{ name: 'kb_1' }, { name: 'kb_2' }],
      }),
    });

    purgeDeletedVectorsMock.mockResolvedValueOnce(3).mockResolvedValueOnce(0);

    const result = await vectorCleanupService.runCleanup();

    expect(result).toEqual({
      collectionsProcessed: 2,
      totalPurged: 3,
      errors: 0,
    });
    expect(purgeDeletedVectorsMock).toHaveBeenNthCalledWith(1, 'kb_1');
    expect(purgeDeletedVectorsMock).toHaveBeenNthCalledWith(2, 'kb_2');
  });

  it('should continue processing collections when one purge fails', async () => {
    getQdrantClientMock.mockReturnValue({
      getCollections: vi.fn().mockResolvedValue({
        collections: [{ name: 'kb_1' }, { name: 'kb_2' }, { name: 'kb_3' }],
      }),
    });

    purgeDeletedVectorsMock
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('purge failed'))
      .mockResolvedValueOnce(5);

    const result = await vectorCleanupService.runCleanup();

    expect(result).toEqual({
      collectionsProcessed: 2,
      totalPurged: 7,
      errors: 1,
    });
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });

  it('should throw when listing collections fails', async () => {
    const connectionError = new Error('qdrant unavailable');
    getQdrantClientMock.mockReturnValue({
      getCollections: vi.fn().mockRejectedValue(connectionError),
    });

    await expect(vectorCleanupService.runCleanup()).rejects.toThrow('qdrant unavailable');
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { error: connectionError },
      'Vector cleanup failed'
    );
  });
});
