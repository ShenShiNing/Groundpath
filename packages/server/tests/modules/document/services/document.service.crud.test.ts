import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DOCUMENT_ERROR_CODES } from '@groundpath/shared';
import { AppError } from '@core/errors';
import {
  mockUserId,
  mockDocumentId,
  mockDocument,
  mockDocumentVersion,
  logTestInfo,
} from '@tests/__mocks__/document.mocks';

// ==================== Mocks ====================

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid-123'),
}));

// Mock withTransaction to simply execute the callback
vi.mock('@core/db/db.utils', () => ({
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
    findByDocumentAndVersion: vi.fn(),
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

vi.mock('@modules/knowledge-base/services/knowledge-base.service', () => ({
  knowledgeBaseService: {
    validateOwnership: vi.fn(),
    getEmbeddingConfig: vi.fn(() =>
      Promise.resolve({
        collectionName: 'test-collection',
      })
    ),
    incrementDocumentCount: vi.fn(),
    incrementTotalChunks: vi.fn(),
  },
}));

vi.mock('@modules/vector/public/repositories', () => ({
  vectorRepository: {
    deleteByDocumentId: vi.fn(() => Promise.resolve(true)),
  },
}));

vi.mock('@modules/rag/queue/document-processing.queue', () => ({
  enqueueDocumentProcessing: vi.fn(() => Promise.resolve()),
}));

vi.mock('@core/logger/operation-logger', () => ({
  logOperation: vi.fn(),
}));

vi.mock('@core/logger', () => ({
  createLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Import after mocks
import { documentService } from '@modules/document/public/documents';
import {
  documentRepository,
  documentVersionRepository,
} from '@modules/document/public/repositories';
import { documentStorageService } from '@modules/document/public/storage';

// ==================== getById ====================
// 场景：通过 ID 获取文档详情（含所有权检查）
describe('documentService > getById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功获取文档
  it('should return DocumentInfo when document exists and belongs to user', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);

    const result = await documentService.getById(mockDocumentId, mockUserId);

    logTestInfo(
      { documentId: mockDocumentId, userId: mockUserId },
      { id: mockDocumentId, title: 'Test Document' },
      { id: result.id, title: result.title }
    );

    expect(result.id).toBe(mockDocumentId);
    expect(result.title).toBe('Test Document');
    expect(result.userId).toBe(mockUserId);
    expect(documentRepository.findByIdAndUser).toHaveBeenCalledWith(mockDocumentId, mockUserId);
  });

  // 场景 2：文档不存在 → 抛出 DOCUMENT_NOT_FOUND
  it('should throw DOCUMENT_NOT_FOUND when document does not exist', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await documentService.getById('nonexistent-id', mockUserId);
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    logTestInfo(
      { documentId: 'nonexistent-id' },
      { code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND, statusCode: 404 },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND);
    expect(actual?.statusCode).toBe(404);
  });
});

// ==================== list ====================
// 场景：分页查询文档列表
// 职责：调用 repository → 转换为 DocumentListItem → 计算分页
describe('documentService > list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：正常分页返回
  it('should return paginated document list', async () => {
    const docs = [mockDocument, { ...mockDocument, id: 'doc-2', title: 'Second Doc' }];
    vi.mocked(documentRepository.list).mockResolvedValue({
      documents: docs,
      total: 15,
    });

    const params = {
      page: 1,
      pageSize: 10,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };
    const result = await documentService.list(mockUserId, params);

    logTestInfo(
      { page: 1, pageSize: 10, total: 15 },
      { documentCount: 2, totalPages: 2, page: 1 },
      {
        documentCount: result.documents.length,
        totalPages: result.pagination.totalPages,
        page: result.pagination.page,
      }
    );

    expect(result.documents).toHaveLength(2);
    expect(result.pagination.total).toBe(15);
    expect(result.pagination.totalPages).toBe(2);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.pageSize).toBe(10);
  });

  // 场景 2：空结果
  it('should handle empty result set', async () => {
    vi.mocked(documentRepository.list).mockResolvedValue({
      documents: [],
      total: 0,
    });

    const params = {
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };
    const result = await documentService.list(mockUserId, params);

    logTestInfo(
      { total: 0 },
      { documentCount: 0, totalPages: 0 },
      { documentCount: result.documents.length, totalPages: result.pagination.totalPages }
    );

    expect(result.documents).toHaveLength(0);
    expect(result.pagination.totalPages).toBe(0);
  });

  // 场景 3：返回的 DocumentListItem 应只包含列表必需字段
  it('should return DocumentListItem fields (no storageKey, textContent, etc.)', async () => {
    vi.mocked(documentRepository.list).mockResolvedValue({
      documents: [mockDocument],
      total: 1,
    });

    const params = {
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };
    const result = await documentService.list(mockUserId, params);
    const item = result.documents[0]!;

    logTestInfo(
      { documentId: mockDocumentId },
      { hasStorageKey: false, hasTextContent: false },
      {
        hasStorageKey: 'storageKey' in item,
        hasTextContent: 'textContent' in item,
      }
    );

    expect(item.id).toBe(mockDocumentId);
    expect(item.title).toBe('Test Document');
    expect('storageKey' in item).toBe(false);
    expect('textContent' in item).toBe(false);
    expect('userId' in item).toBe(false);
  });
});

// ==================== update ====================
// 场景：更新文档元数据
// 职责：所有权验证 → 目标文件夹验证 → 更新数据库记录
describe('documentService > update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：更新标题和描述
  it('should update document title and description', async () => {
    const updatedDoc = { ...mockDocument, title: 'New Title', description: 'New desc' };
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentRepository.update).mockResolvedValue(updatedDoc);

    const result = await documentService.update(mockDocumentId, mockUserId, {
      title: 'New Title',
      description: 'New desc',
    });

    logTestInfo(
      { title: 'New Title', description: 'New desc' },
      { title: 'New Title', description: 'New desc' },
      { title: result.title, description: result.description }
    );

    expect(result.title).toBe('New Title');
    expect(result.description).toBe('New desc');
    expect(documentRepository.update).toHaveBeenCalledWith(
      mockDocumentId,
      expect.objectContaining({
        title: 'New Title',
        description: 'New desc',
        updatedBy: mockUserId,
      })
    );
  });

  // 场景 2：文档不存在
  it('should throw DOCUMENT_NOT_FOUND when document does not exist', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await documentService.update('nonexistent', mockUserId, { title: 'New' });
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { documentId: 'nonexistent' },
      { code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND);
  });
});

// ==================== delete ====================
// 场景：软删除文档
describe('documentService > delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功软删除
  it('should soft delete document', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentRepository.softDelete).mockResolvedValue(undefined);

    await documentService.delete(mockDocumentId, mockUserId);

    logTestInfo(
      { documentId: mockDocumentId },
      { softDeleteCalled: true },
      { softDeleteCalled: vi.mocked(documentRepository.softDelete).mock.calls.length > 0 }
    );

    expect(documentRepository.softDelete).toHaveBeenCalledWith(
      mockDocumentId,
      mockUserId,
      expect.anything() // tx parameter
    );
  });

  // 场景 2：文档不存在
  it('should throw DOCUMENT_NOT_FOUND when document does not exist', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await documentService.delete('nonexistent', mockUserId);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { documentId: 'nonexistent' },
      { code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND);
    expect(documentRepository.softDelete).not.toHaveBeenCalled();
  });
});

// ==================== getDownloadStream ====================
// 场景：获取文档下载流
describe('documentService > getDownloadStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功获取下载流
  it('should return download stream with correct fileName', async () => {
    const mockStream = {
      body: (async function* () {
        yield new Uint8Array([1, 2, 3]);
      })(),
      contentType: 'application/pdf',
      contentLength: 1024,
    };
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentVersionRepository.findByDocumentAndVersion).mockResolvedValue(
      mockDocumentVersion
    );
    vi.mocked(documentStorageService.getDocumentStream).mockResolvedValue(mockStream);

    const result = await documentService.getDownloadStream(mockDocumentId, mockUserId);

    logTestInfo(
      { documentId: mockDocumentId },
      { fileName: 'test.pdf', contentType: 'application/pdf' },
      { fileName: result.fileName, contentType: result.contentType }
    );

    expect(result.fileName).toBe('test.pdf');
    expect(result.contentType).toBe('application/pdf');
    expect(documentStorageService.getDocumentStream).toHaveBeenCalledWith(
      mockDocumentVersion.storageKey
    );
  });

  // 场景 2：文档不存在
  it('should throw DOCUMENT_NOT_FOUND when document does not exist', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await documentService.getDownloadStream('nonexistent', mockUserId);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { documentId: 'nonexistent' },
      { code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND);
  });
});
