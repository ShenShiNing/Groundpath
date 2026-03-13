import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeBase } from '@core/db/schema/document/knowledge-bases.schema';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@core/logger', () => ({
  createLogger: vi.fn(() => loggerMock),
}));

vi.mock('@modules/knowledge-base/repositories/knowledge-base.repository', () => ({
  knowledgeBaseRepository: {
    findById: vi.fn(),
    listByUser: vi.fn(),
    listAll: vi.fn(),
    updateCounters: vi.fn(),
  },
}));

vi.mock('@modules/document', () => ({
  documentRepository: {
    countByKnowledgeBaseId: vi.fn(),
    sumChunksByKnowledgeBaseId: vi.fn(),
  },
}));

import { counterSyncService } from '@modules/knowledge-base/services/counter-sync.service';
import { knowledgeBaseRepository } from '@modules/knowledge-base/repositories/knowledge-base.repository';
import { documentRepository } from '@modules/document';

const now = new Date('2026-02-17T00:00:00.000Z');

const kb1: KnowledgeBase = {
  id: 'kb-1',
  userId: 'user-1',
  name: 'KB 1',
  description: null,
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  documentCount: 1,
  totalChunks: 5,
  createdBy: 'user-1',
  createdAt: now,
  updatedBy: 'user-1',
  updatedAt: now,
  deletedBy: null,
  deletedAt: null,
};

const kb2: KnowledgeBase = {
  id: 'kb-2',
  userId: 'user-1',
  name: 'KB 2',
  description: null,
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  documentCount: 3,
  totalChunks: 8,
  createdBy: 'user-1',
  createdAt: now,
  updatedBy: 'user-1',
  updatedAt: now,
  deletedBy: null,
  deletedAt: null,
};

describe('counterSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sync one knowledge base and update counters when values changed', async () => {
    vi.mocked(knowledgeBaseRepository.findById).mockResolvedValue(kb1);
    vi.mocked(documentRepository.countByKnowledgeBaseId).mockResolvedValue(4);
    vi.mocked(documentRepository.sumChunksByKnowledgeBaseId).mockResolvedValue(12);

    const result = await counterSyncService.syncKnowledgeBase('kb-1');

    expect(result).toEqual({
      knowledgeBaseId: 'kb-1',
      name: 'KB 1',
      documentCount: { before: 1, after: 4, changed: true },
      totalChunks: { before: 5, after: 12, changed: true },
    });
    expect(knowledgeBaseRepository.updateCounters).toHaveBeenCalledWith('kb-1', {
      documentCount: 4,
      totalChunks: 12,
    });
    expect(loggerMock.info).toHaveBeenCalled();
  });

  it('should not update counters when values are already in sync', async () => {
    vi.mocked(knowledgeBaseRepository.findById).mockResolvedValue(kb1);
    vi.mocked(documentRepository.countByKnowledgeBaseId).mockResolvedValue(1);
    vi.mocked(documentRepository.sumChunksByKnowledgeBaseId).mockResolvedValue(5);

    const result = await counterSyncService.syncKnowledgeBase('kb-1');

    expect(result.documentCount.changed).toBe(false);
    expect(result.totalChunks.changed).toBe(false);
    expect(knowledgeBaseRepository.updateCounters).not.toHaveBeenCalled();
  });

  it('should throw when knowledge base does not exist', async () => {
    vi.mocked(knowledgeBaseRepository.findById).mockResolvedValue(undefined);

    await expect(counterSyncService.syncKnowledgeBase('missing-kb')).rejects.toThrow(
      'Knowledge base not found'
    );
  });

  it('should continue syncing user knowledge bases when one fails', async () => {
    vi.mocked(knowledgeBaseRepository.listByUser).mockResolvedValue([kb1, kb2]);

    const spy = vi.spyOn(counterSyncService, 'syncKnowledgeBase');
    spy.mockResolvedValueOnce({
      knowledgeBaseId: 'kb-1',
      name: 'KB 1',
      documentCount: { before: 1, after: 1, changed: false },
      totalChunks: { before: 5, after: 5, changed: false },
    });
    spy.mockRejectedValueOnce(new Error('sync failed'));

    const result = await counterSyncService.syncUserKnowledgeBases('user-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.knowledgeBaseId).toBe('kb-1');
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ kbId: 'kb-2' }),
      'Failed to sync knowledge base counters'
    );
  });

  it('should return aggregate stats for syncAll', async () => {
    vi.mocked(knowledgeBaseRepository.listAll).mockResolvedValue([kb1, kb2]);

    const spy = vi.spyOn(counterSyncService, 'syncKnowledgeBase');
    spy.mockResolvedValueOnce({
      knowledgeBaseId: 'kb-1',
      name: 'KB 1',
      documentCount: { before: 1, after: 1, changed: false },
      totalChunks: { before: 5, after: 5, changed: false },
    });
    spy.mockRejectedValueOnce(new Error('sync failed'));

    const result = await counterSyncService.syncAll();

    expect(result).toEqual({ total: 2, synced: 1, errors: 1 });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { total: 2, synced: 1, errors: 1 },
      'Counter sync completed'
    );
  });
});
