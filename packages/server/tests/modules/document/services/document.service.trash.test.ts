import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DOCUMENT_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@shared/errors';
import {
  mockUserId,
  mockDocument,
  mockDeletedDocument,
  mockDocumentVersion,
  logTestInfo,
} from '@tests/__mocks__/document.mocks';

// ==================== Mocks ====================

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid-123'),
}));

// Mock withTransaction to simply execute the callback
vi.mock('@shared/db/db.utils', () => ({
  withTransaction: vi.fn((callback) => callback({})),
  getDbContext: vi.fn((tx) => tx ?? {}),
  now: vi.fn(() => new Date()),
}));

vi.mock('@modules/document/repositories/document.repository', () => ({
  documentRepository: {
    create: vi.fn(),
    findByIdAndUser: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    findDeletedByIdAndUser: vi.fn(),
    listDeleted: vi.fn(),
    listDeletedIds: vi.fn(),
    restore: vi.fn(),
    hardDelete: vi.fn(),
    moveAllFromFolderToRoot: vi.fn(),
  },
}));

vi.mock('@modules/document/repositories/document-version.repository', () => ({
  documentVersionRepository: {
    create: vi.fn(),
    listByDocumentId: vi.fn(),
    findById: vi.fn(),
    deleteByDocumentId: vi.fn(),
  },
}));

vi.mock('@modules/document/repositories/document-chunk.repository', () => ({
  documentChunkRepository: {
    deleteByDocumentId: vi.fn(),
  },
}));

vi.mock('@modules/document/services/document-storage.service', () => ({
  documentStorageService: {
    validateFile: vi.fn(),
    uploadDocument: vi.fn(),
    extractTextContent: vi.fn(),
    deleteDocument: vi.fn(),
    getDocumentStream: vi.fn(),
  },
}));

vi.mock('@modules/knowledge-base', () => ({
  knowledgeBaseService: {
    validateOwnership: vi.fn(),
    getEmbeddingConfig: vi.fn(() =>
      Promise.resolve({
        collectionName: 'test-collection',
      })
    ),
    incrementDocumentCount: vi.fn(() => Promise.resolve()),
    incrementTotalChunks: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@modules/vector', () => ({
  vectorRepository: {
    deleteByDocumentId: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@modules/rag/queue/document-processing.queue', () => ({
  enqueueDocumentProcessing: vi.fn(() => Promise.resolve()),
}));

vi.mock('@shared/logger/operation-logger', () => ({
  logOperation: vi.fn(),
}));

// Mock logger - use inline object to avoid hoisting issues
vi.mock('@shared/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
}));

// Import after mocks
import { documentService } from '@modules/document';
import { documentRepository } from '@modules/document';
import { documentVersionRepository } from '@modules/document';
import { documentStorageService } from '@modules/document';
import { documentTrashService } from '@modules/document';

// ==================== listTrash ====================
// 场景：查询已删除的文档（回收站）
describe('documentService > listTrash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功返回回收站列表
  it('should return paginated trash document list', async () => {
    vi.mocked(documentRepository.listDeleted).mockResolvedValue({
      documents: [mockDeletedDocument],
      total: 1,
    });

    const params = {
      page: 1,
      pageSize: 20,
      sortBy: 'deletedAt' as const,
      sortOrder: 'desc' as const,
    };
    const result = await documentService.listTrash(mockUserId, params);

    logTestInfo(
      { page: 1, pageSize: 20 },
      { documentCount: 1, total: 1, totalPages: 1 },
      {
        documentCount: result.documents.length,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
      }
    );

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]!.deletedAt).toEqual(new Date('2024-01-15'));
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
  });

  // 场景 2：回收站为空
  it('should handle empty trash', async () => {
    vi.mocked(documentRepository.listDeleted).mockResolvedValue({
      documents: [],
      total: 0,
    });

    const params = {
      page: 1,
      pageSize: 20,
      sortBy: 'deletedAt' as const,
      sortOrder: 'desc' as const,
    };
    const result = await documentService.listTrash(mockUserId, params);

    logTestInfo(
      { userId: mockUserId },
      { documentCount: 0, totalPages: 0 },
      { documentCount: result.documents.length, totalPages: result.pagination.totalPages }
    );

    expect(result.documents).toHaveLength(0);
    expect(result.pagination.totalPages).toBe(0);
  });

  // 场景 3：TrashDocumentListItem 应包含 deletedAt
  it('should include deletedAt in trash list items', async () => {
    vi.mocked(documentRepository.listDeleted).mockResolvedValue({
      documents: [mockDeletedDocument],
      total: 1,
    });

    const params = {
      page: 1,
      pageSize: 20,
      sortBy: 'deletedAt' as const,
      sortOrder: 'desc' as const,
    };
    const result = await documentService.listTrash(mockUserId, params);
    const item = result.documents[0]!;

    logTestInfo(
      { documentId: mockDeletedDocument.id },
      { hasDeletedAt: true },
      { hasDeletedAt: 'deletedAt' in item }
    );

    expect(item.deletedAt).toBeDefined();
    expect(item.id).toBe('doc-deleted-1');
    expect(item.title).toBe('Deleted Document');
  });
});

// ==================== restore ====================
// 场景：从回收站恢复文档
describe('documentService > restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功恢复文档
  // 应从 findDeletedByIdAndUser 查找，然后清空 deletedAt/deletedBy
  it('should restore document from trash', async () => {
    const restoredDoc = { ...mockDocument, deletedAt: null, deletedBy: null };
    vi.mocked(documentRepository.findDeletedByIdAndUser).mockResolvedValue(mockDeletedDocument);
    vi.mocked(documentRepository.restore).mockResolvedValue(restoredDoc);

    const result = await documentService.restore('doc-deleted-1', mockUserId);

    logTestInfo(
      { documentId: 'doc-deleted-1' },
      { restored: true, id: 'doc-deleted-1' },
      { restored: true, id: result.id }
    );

    expect(documentRepository.findDeletedByIdAndUser).toHaveBeenCalledWith(
      'doc-deleted-1',
      mockUserId
    );
    expect(documentRepository.restore).toHaveBeenCalledWith('doc-deleted-1', expect.anything());
    expect(result.id).toBeDefined();
  });

  // 场景 2：回收站中找不到文档
  it('should throw DOCUMENT_NOT_FOUND when document not in trash', async () => {
    vi.mocked(documentRepository.findDeletedByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await documentService.restore('nonexistent', mockUserId);
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    logTestInfo(
      { documentId: 'nonexistent' },
      { code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND, statusCode: 404 },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND);
    expect(actual?.statusCode).toBe(404);
    expect(documentRepository.restore).not.toHaveBeenCalled();
  });
});

// ==================== permanentDelete ====================
// 场景：永久删除文档（从 R2 存储和数据库中彻底删除）
describe('documentService > permanentDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功永久删除
  // 应先从 R2 删除文件，然后硬删除数据库记录
  it('should delete from storage and hard delete from database', async () => {
    vi.mocked(documentRepository.findDeletedByIdAndUser).mockResolvedValue(mockDeletedDocument);
    vi.mocked(documentVersionRepository.listByDocumentId).mockResolvedValue([mockDocumentVersion]);
    vi.mocked(documentStorageService.deleteDocument).mockResolvedValue(undefined);
    vi.mocked(documentRepository.hardDelete).mockResolvedValue(undefined);

    await documentService.permanentDelete('doc-deleted-1', mockUserId);

    logTestInfo(
      { documentId: 'doc-deleted-1' },
      { storageDeleted: true, dbDeleted: true },
      {
        storageDeleted: vi.mocked(documentStorageService.deleteDocument).mock.calls.length > 0,
        dbDeleted: vi.mocked(documentRepository.hardDelete).mock.calls.length > 0,
      }
    );

    expect(documentStorageService.deleteDocument).toHaveBeenCalledWith(
      mockDocumentVersion.storageKey
    );
    expect(documentRepository.hardDelete).toHaveBeenCalledWith('doc-deleted-1', expect.anything());
  });

  // 场景 2：R2 存储删除失败 — 仍然应该硬删除数据库记录
  // R2 错误应被捕获记录，不影响数据库操作
  it('should still hard delete database record when R2 deletion fails', async () => {
    vi.mocked(documentRepository.findDeletedByIdAndUser).mockResolvedValue(mockDeletedDocument);
    vi.mocked(documentVersionRepository.listByDocumentId).mockResolvedValue([mockDocumentVersion]);
    vi.mocked(documentStorageService.deleteDocument).mockRejectedValue(
      new Error('R2 connection timeout')
    );
    vi.mocked(documentRepository.hardDelete).mockResolvedValue(undefined);

    await documentService.permanentDelete('doc-deleted-1', mockUserId);

    logTestInfo(
      { storageDeleteFailed: true },
      { dbStillDeleted: true },
      {
        dbStillDeleted: vi.mocked(documentRepository.hardDelete).mock.calls.length > 0,
      }
    );

    // The main assertion is that hard delete still happens even when storage deletion fails
    expect(documentRepository.hardDelete).toHaveBeenCalledWith('doc-deleted-1', expect.anything());
  });

  // 场景 3：回收站中找不到文档
  it('should throw DOCUMENT_NOT_FOUND when document not in trash', async () => {
    vi.mocked(documentRepository.findDeletedByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await documentService.permanentDelete('nonexistent', mockUserId);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { documentId: 'nonexistent' },
      { code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND);
    expect(documentStorageService.deleteDocument).not.toHaveBeenCalled();
    expect(documentRepository.hardDelete).not.toHaveBeenCalled();
  });
});

// ==================== clearTrash ====================
// 场景：批量清空回收站
describe('documentService > clearTrash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return zero counts when trash is empty', async () => {
    vi.mocked(documentRepository.listDeletedIds).mockResolvedValue([]);

    const result = await documentService.clearTrash(mockUserId);

    expect(result.deletedCount).toBe(0);
    expect(result.failedCount).toBe(0);
  });

  it('should clear all trash documents successfully', async () => {
    vi.mocked(documentRepository.listDeletedIds).mockResolvedValue(['doc-1', 'doc-2']);
    const permanentDeleteSpy = vi
      .spyOn(documentTrashService, 'permanentDelete')
      .mockResolvedValue(undefined);

    const result = await documentService.clearTrash(mockUserId);

    expect(permanentDeleteSpy).toHaveBeenCalledTimes(2);
    expect(permanentDeleteSpy).toHaveBeenCalledWith('doc-1', mockUserId, undefined);
    expect(permanentDeleteSpy).toHaveBeenCalledWith('doc-2', mockUserId, undefined);
    expect(result.deletedCount).toBe(2);
    expect(result.failedCount).toBe(0);
  });

  it('should continue deleting when one document fails', async () => {
    vi.mocked(documentRepository.listDeletedIds).mockResolvedValue(['doc-1', 'doc-2', 'doc-3']);
    const permanentDeleteSpy = vi
      .spyOn(documentTrashService, 'permanentDelete')
      .mockRejectedValueOnce(new Error('Delete failed'))
      .mockResolvedValue(undefined);

    const result = await documentService.clearTrash(mockUserId);

    expect(permanentDeleteSpy).toHaveBeenCalledTimes(3);
    expect(result.deletedCount).toBe(2);
    expect(result.failedCount).toBe(1);
  });
});
