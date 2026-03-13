import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock logger ───
const { loggerMock } = vi.hoisted(() => ({
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@core/logger', () => ({
  createLogger: () => loggerMock,
  logger: loggerMock,
}));

// ─── Mock Qdrant client ───
const { getQdrantClientMock } = vi.hoisted(() => ({
  getQdrantClientMock: vi.fn(),
}));

vi.mock('@modules/vector/qdrant.client', () => ({
  getQdrantClient: getQdrantClientMock,
}));

import { vectorRepository } from '@modules/vector/vector.repository';

describe('Vector Repository Error Injection', () => {
  let mockQdrant: {
    upsert: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    setPayload: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQdrant = {
      upsert: vi.fn(),
      search: vi.fn(),
      delete: vi.fn(),
      setPayload: vi.fn(),
      count: vi.fn(),
    };
    getQdrantClientMock.mockReturnValue(mockQdrant);
  });

  // ─── Upsert Errors ───
  describe('upsert', () => {
    it('should throw on qdrant upsert timeout', async () => {
      mockQdrant.upsert.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error('Timed out')), 100);
          })
      );

      await expect(
        vectorRepository.upsert('test-collection', [
          {
            id: 'v1',
            vector: [0.1],
            payload: {
              content: 'test',
            } as unknown as import('@modules/vector/vector.types').ChunkPayload,
          },
        ])
      ).rejects.toThrow();
    });

    it('should skip upsert for empty points array', async () => {
      await vectorRepository.upsert('test-collection', []);
      expect(mockQdrant.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── Search Errors ───
  describe('search', () => {
    it('should throw on qdrant search timeout', async () => {
      mockQdrant.search.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error('Timed out')), 100);
          })
      );

      await expect(
        vectorRepository.search('test-collection', [0.1, 0.2], 'user-1')
      ).rejects.toThrow();
    });

    it('should throw on qdrant search error', async () => {
      mockQdrant.search.mockRejectedValue(new Error('Connection refused'));

      await expect(
        vectorRepository.search('test-collection', [0.1, 0.2], 'user-1')
      ).rejects.toThrow('Connection refused');
    });
  });

  // ─── deleteByDocumentId: soft-delete succeeds, hard-delete fails ───
  describe('deleteByDocumentId', () => {
    it('should return true when soft-delete succeeds but hard-delete fails', async () => {
      mockQdrant.setPayload.mockResolvedValue(undefined); // soft-delete ok
      mockQdrant.delete.mockRejectedValue(new Error('Hard delete failed'));

      const result = await vectorRepository.deleteByDocumentId('col', 'doc-1');

      expect(result).toBe(true);
      expect(loggerMock.warn).toHaveBeenCalled();
    });

    it('should return false when soft-delete fails', async () => {
      mockQdrant.setPayload.mockRejectedValue(new Error('setPayload failed'));
      mockQdrant.delete.mockRejectedValue(new Error('delete also failed'));

      const result = await vectorRepository.deleteByDocumentId('col', 'doc-1');

      expect(result).toBe(false);
    });
  });

  describe('deleteByIndexVersionId', () => {
    it('should return true when soft-delete succeeds but hard-delete fails', async () => {
      mockQdrant.setPayload.mockResolvedValue(undefined);
      mockQdrant.delete.mockRejectedValue(new Error('Hard delete failed'));

      const result = await vectorRepository.deleteByIndexVersionId('col', 'idx-1');

      expect(result).toBe(true);
      expect(loggerMock.warn).toHaveBeenCalled();
    });

    it('should return false when soft-delete fails', async () => {
      mockQdrant.setPayload.mockRejectedValue(new Error('setPayload failed'));
      mockQdrant.delete.mockRejectedValue(new Error('delete also failed'));

      const result = await vectorRepository.deleteByIndexVersionId('col', 'idx-1');

      expect(result).toBe(false);
    });
  });

  describe('deleteByKnowledgeBaseId', () => {
    it('should return true when soft-delete succeeds but hard-delete fails', async () => {
      mockQdrant.setPayload.mockResolvedValue(undefined);
      mockQdrant.delete.mockRejectedValue(new Error('Hard delete failed'));

      const result = await vectorRepository.deleteByKnowledgeBaseId('col', 'kb-1');

      expect(result).toBe(true);
      expect(loggerMock.warn).toHaveBeenCalled();
    });

    it('should return false when soft-delete fails', async () => {
      mockQdrant.setPayload.mockRejectedValue(new Error('setPayload failed'));
      mockQdrant.delete.mockRejectedValue(new Error('delete also failed'));

      const result = await vectorRepository.deleteByKnowledgeBaseId('col', 'kb-1');

      expect(result).toBe(false);
    });
  });

  // ─── markAsDeleted ───
  describe('markAsDeleted', () => {
    it('should return false when called without filter', async () => {
      const result = await vectorRepository.markAsDeleted('col', {});

      expect(result).toBe(false);
      expect(loggerMock.warn).toHaveBeenCalled();
    });

    it('should return false on setPayload failure', async () => {
      mockQdrant.setPayload.mockRejectedValue(new Error('Timeout'));

      const result = await vectorRepository.markAsDeleted('col', { documentId: 'doc-1' });

      expect(result).toBe(false);
      expect(loggerMock.warn).toHaveBeenCalled();
    });

    it('should return true on successful operation', async () => {
      mockQdrant.setPayload.mockResolvedValue(undefined);

      const result = await vectorRepository.markAsDeleted('col', { documentId: 'doc-1' });

      expect(result).toBe(true);
      expect(mockQdrant.setPayload).toHaveBeenCalledWith(
        'col',
        expect.objectContaining({
          payload: expect.objectContaining({
            isDeleted: true,
            deletedAtMs: expect.any(Number),
          }),
        })
      );
    });

    it('should support indexVersionId filter', async () => {
      mockQdrant.setPayload.mockResolvedValue(undefined);

      const result = await vectorRepository.markAsDeleted('col', { indexVersionId: 'idx-1' });

      expect(result).toBe(true);
      expect(mockQdrant.setPayload).toHaveBeenCalledWith(
        'col',
        expect.objectContaining({
          filter: {
            must: [{ key: 'indexVersionId', match: { value: 'idx-1' } }],
          },
        })
      );
    });
  });

  // ─── purgeDeletedVectors ───
  describe('purgeDeletedVectors', () => {
    it('should return 0 when count is 0', async () => {
      mockQdrant.count.mockResolvedValue({ count: 0 });

      const result = await vectorRepository.purgeDeletedVectors('col');

      expect(result).toBe(0);
      expect(mockQdrant.delete).not.toHaveBeenCalled();
    });

    it('should throw on count failure', async () => {
      mockQdrant.count.mockRejectedValue(new Error('Count failed'));

      await expect(vectorRepository.purgeDeletedVectors('col')).rejects.toThrow('Count failed');
    });

    it('should throw on delete failure after successful count', async () => {
      mockQdrant.count.mockResolvedValue({ count: 5 });
      mockQdrant.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(vectorRepository.purgeDeletedVectors('col')).rejects.toThrow('Delete failed');
    });

    it('should return count on successful purge', async () => {
      mockQdrant.count.mockResolvedValue({ count: 3 });
      mockQdrant.delete.mockResolvedValue(undefined);

      const result = await vectorRepository.purgeDeletedVectors('col');

      expect(result).toBe(3);
    });

    it('should scope cleanup to vectors deleted before the run started', async () => {
      mockQdrant.count.mockResolvedValue({ count: 2 });
      mockQdrant.delete.mockResolvedValue(undefined);

      await vectorRepository.purgeDeletedVectors('col', 1234);

      expect(mockQdrant.count).toHaveBeenCalledWith(
        'col',
        expect.objectContaining({
          filter: {
            must: [
              { key: 'isDeleted', match: { value: true } },
              { key: 'deletedAtMs', range: { lte: 1234 } },
            ],
          },
        })
      );
      expect(mockQdrant.delete).toHaveBeenCalledWith(
        'col',
        expect.objectContaining({
          filter: {
            must: [
              { key: 'isDeleted', match: { value: true } },
              { key: 'deletedAtMs', range: { lte: 1234 } },
            ],
          },
        })
      );
    });
  });

  // ─── countByKnowledgeBaseId ───
  describe('countByKnowledgeBaseId', () => {
    it('should return 0 when the collection does not exist', async () => {
      mockQdrant.count.mockRejectedValue(
        Object.assign(new Error('Collection does not exist'), {
          response: { status: 404 },
        })
      );

      const result = await vectorRepository.countByKnowledgeBaseId('col', 'kb-1');

      expect(result).toBe(0);
    });

    it('should throw on non-not-found count failure', async () => {
      mockQdrant.count.mockRejectedValue(new Error('Connection lost'));

      await expect(vectorRepository.countByKnowledgeBaseId('col', 'kb-1')).rejects.toThrow(
        'Connection lost'
      );
      expect(loggerMock.warn).toHaveBeenCalled();
    });
  });

  // ─── deleteByIds ───
  describe('deleteByIds', () => {
    it('should skip when ids array is empty', async () => {
      await vectorRepository.deleteByIds('col', []);
      expect(mockQdrant.setPayload).not.toHaveBeenCalled();
      expect(mockQdrant.delete).not.toHaveBeenCalled();
    });

    it('should continue to hard-delete even when soft-delete fails', async () => {
      mockQdrant.setPayload.mockRejectedValue(new Error('soft delete fail'));
      mockQdrant.delete.mockResolvedValue(undefined);

      await vectorRepository.deleteByIds('col', ['id-1', 'id-2']);

      expect(loggerMock.warn).toHaveBeenCalled();
      expect(mockQdrant.delete).toHaveBeenCalled();
    });

    it('should log warning when hard-delete fails after soft-delete fails', async () => {
      mockQdrant.setPayload.mockRejectedValue(new Error('soft fail'));
      mockQdrant.delete.mockRejectedValue(new Error('hard fail'));

      await vectorRepository.deleteByIds('col', ['id-1']);

      // Should have 2 warnings: one for soft, one for hard
      expect(loggerMock.warn).toHaveBeenCalledTimes(2);
    });

    it('should stamp deletedAtMs during point soft delete', async () => {
      mockQdrant.setPayload.mockResolvedValue(undefined);
      mockQdrant.delete.mockResolvedValue(undefined);

      await vectorRepository.deleteByIds('col', ['id-1']);

      expect(mockQdrant.setPayload).toHaveBeenCalledWith(
        'col',
        expect.objectContaining({
          payload: expect.objectContaining({
            isDeleted: true,
            deletedAtMs: expect.any(Number),
          }),
        })
      );
    });
  });
});
