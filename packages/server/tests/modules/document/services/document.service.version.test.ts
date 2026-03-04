import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DOCUMENT_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@shared/errors';
import {
  mockUserId,
  mockDocumentId,
  mockVersionId,
  mockDocument,
  mockDocumentVersion,
  mockFile,
  mockStorageResult,
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
    getEmbeddingConfig: vi.fn(),
    incrementDocumentCount: vi.fn(),
    incrementTotalChunks: vi.fn(),
  },
}));

vi.mock('@modules/rag/services/processing.service', () => ({
  processingService: {
    processDocument: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@shared/logger/operation-logger', () => ({
  logOperation: vi.fn(),
}));

vi.mock('@shared/logger', () => ({
  createLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Import after mocks
import { documentService } from '@modules/document';
import { documentRepository } from '@modules/document';
import { documentVersionRepository } from '@modules/document';
import { documentStorageService } from '@modules/document';

// ==================== uploadNewVersion ====================
// 场景：上传文档的新版本
// 职责：所有权验证 → 文件验证 → 保存当前版本到历史 → 上传新文件 → 更新文档记录
describe('documentService > uploadNewVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功上传新版本
  // 版本号应从 1 递增到 2
  it('should upload new version and increment version number', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentVersionRepository.create).mockResolvedValue(mockDocumentVersion);
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockStorageResult);
    vi.mocked(documentStorageService.extractTextContent).mockResolvedValue({
      text: 'New PDF text',
      truncated: false,
    });
    vi.mocked(documentRepository.update).mockResolvedValue({
      ...mockDocument,
      currentVersion: 2,
      fileName: mockFile.originalname,
    });

    const result = await documentService.uploadNewVersion(mockDocumentId, mockUserId, mockFile, {
      changeNote: 'Updated content',
    });

    logTestInfo(
      { documentId: mockDocumentId, changeNote: 'Updated content' },
      { currentVersion: 2 },
      { currentVersion: result.currentVersion }
    );

    expect(result.currentVersion).toBe(2);
  });

  // 场景 2：创建新版本记录
  // 应创建包含新文件信息的版本记录
  it('should create new version record with file info', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentVersionRepository.create).mockResolvedValue(mockDocumentVersion);
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockStorageResult);
    vi.mocked(documentStorageService.extractTextContent).mockResolvedValue({
      text: null,
      truncated: false,
    });
    vi.mocked(documentRepository.update).mockResolvedValue({
      ...mockDocument,
      currentVersion: 2,
    });

    await documentService.uploadNewVersion(mockDocumentId, mockUserId, mockFile, {
      changeNote: 'Bug fix',
    });

    const versionCreateCall = vi.mocked(documentVersionRepository.create).mock.calls[0]?.[0];

    logTestInfo(
      { currentVersion: mockDocument.currentVersion },
      {
        newVersion: 2,
        changeNote: 'Bug fix',
      },
      {
        newVersion: versionCreateCall?.version,
        changeNote: versionCreateCall?.changeNote,
      }
    );

    expect(documentVersionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: mockDocumentId,
        version: 2, // currentVersion + 1
        fileName: mockFile.originalname,
        mimeType: mockFile.mimetype,
        fileSize: mockFile.size,
        storageKey: mockStorageResult.storageKey,
        source: 'upload',
        changeNote: 'Bug fix',
        createdBy: mockUserId,
      }),
      expect.anything() // tx parameter
    );
  });

  // 场景 3：changeNote 为空时默认 null
  it('should default changeNote to null when not provided', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentVersionRepository.create).mockResolvedValue(mockDocumentVersion);
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockStorageResult);
    vi.mocked(documentStorageService.extractTextContent).mockResolvedValue({
      text: null,
      truncated: false,
    });
    vi.mocked(documentRepository.update).mockResolvedValue({
      ...mockDocument,
      currentVersion: 2,
    });

    await documentService.uploadNewVersion(mockDocumentId, mockUserId, mockFile);

    const versionCreateCall = vi.mocked(documentVersionRepository.create).mock.calls[0]?.[0];
    logTestInfo(
      { changeNote: 'not provided' },
      { changeNote: null },
      { changeNote: versionCreateCall?.changeNote }
    );

    expect(versionCreateCall?.changeNote).toBeNull();
  });

  // 场景 4：文档不存在
  it('should throw DOCUMENT_NOT_FOUND when document does not exist', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await documentService.uploadNewVersion('nonexistent', mockUserId, mockFile);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { documentId: 'nonexistent' },
      { code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND);
    expect(documentStorageService.validateFile).not.toHaveBeenCalled();
  });

  // 场景 5：文件类型无效
  it('should throw INVALID_FILE_TYPE for unsupported files', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentStorageService.validateFile).mockReturnValue({
      valid: false,
      error: 'Invalid file type',
    });

    let actual: { code: string } | null = null;
    try {
      await documentService.uploadNewVersion(mockDocumentId, mockUserId, {
        buffer: Buffer.from('exe'),
        originalname: 'bad.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
      });
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { mimetype: 'application/x-msdownload' },
      { code: DOCUMENT_ERROR_CODES.INVALID_FILE_TYPE },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.INVALID_FILE_TYPE);
    expect(documentVersionRepository.create).not.toHaveBeenCalled();
  });

  // 场景 6：更新后文档记录包含新文件信息
  it('should update document with new file info and incremented version', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentVersionRepository.create).mockResolvedValue(mockDocumentVersion);
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockStorageResult);
    vi.mocked(documentStorageService.extractTextContent).mockResolvedValue({
      text: 'New extracted text',
      truncated: false,
    });
    vi.mocked(documentRepository.update).mockResolvedValue({
      ...mockDocument,
      currentVersion: 2,
    });

    await documentService.uploadNewVersion(mockDocumentId, mockUserId, mockFile);

    logTestInfo(
      { currentVersion: 1 },
      { newCurrentVersion: 2, fileExtension: mockStorageResult.fileExtension },
      {
        newCurrentVersion: vi.mocked(documentRepository.update).mock.calls[0]?.[1]?.currentVersion,
        fileExtension: vi.mocked(documentRepository.update).mock.calls[0]?.[1]?.fileExtension,
      }
    );

    expect(documentRepository.update).toHaveBeenCalledWith(
      mockDocumentId,
      expect.objectContaining({
        fileName: mockFile.originalname,
        mimeType: mockFile.mimetype,
        fileSize: mockFile.size,
        fileExtension: mockStorageResult.fileExtension,
        currentVersion: 2, // document.currentVersion + 1
        updatedBy: mockUserId,
      }),
      expect.anything() // tx parameter
    );
  });
});

// ==================== getVersionHistory ====================
// 场景：获取文档的版本历史
describe('documentService > getVersionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功获取版本历史
  it('should return version list with currentVersion', async () => {
    const versions = [
      { ...mockDocumentVersion, version: 2, changeNote: 'Second update' },
      { ...mockDocumentVersion, version: 1, changeNote: 'Initial' },
    ];
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue({
      ...mockDocument,
      currentVersion: 3,
    });
    vi.mocked(documentVersionRepository.listByDocumentId).mockResolvedValue(versions);

    const result = await documentService.getVersionHistory(mockDocumentId, mockUserId);

    logTestInfo(
      { documentId: mockDocumentId },
      { currentVersion: 3, historyCount: 2 },
      { currentVersion: result.currentVersion, historyCount: result.versions.length }
    );

    expect(result.currentVersion).toBe(3);
    expect(result.versions).toHaveLength(2);
    expect(result.versions[0]!.version).toBe(2);
    expect(result.versions[1]!.version).toBe(1);
  });

  // 场景 2：版本列表项只包含必要字段
  it('should return simplified version list items', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentVersionRepository.listByDocumentId).mockResolvedValue([mockDocumentVersion]);

    const result = await documentService.getVersionHistory(mockDocumentId, mockUserId);
    const item = result.versions[0]!;

    logTestInfo(
      { documentId: mockDocumentId },
      { fields: ['id', 'version', 'fileName', 'fileSize', 'source', 'changeNote', 'createdAt'] },
      { fields: Object.keys(item) }
    );

    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('version');
    expect(item).toHaveProperty('fileName');
    expect(item).toHaveProperty('fileSize');
    expect(item).toHaveProperty('source');
    expect(item).toHaveProperty('changeNote');
    expect(item).toHaveProperty('createdAt');
    expect(item).not.toHaveProperty('storageKey');
    expect(item).not.toHaveProperty('textContent');
  });

  // 场景 3：文档不存在
  it('should throw DOCUMENT_NOT_FOUND when document does not exist', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await documentService.getVersionHistory('nonexistent', mockUserId);
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

  // 场景 4：无历史版本（新文档，只有当前版本）
  it('should handle document with no version history', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentVersionRepository.listByDocumentId).mockResolvedValue([]);

    const result = await documentService.getVersionHistory(mockDocumentId, mockUserId);

    logTestInfo(
      { documentId: mockDocumentId },
      { currentVersion: 1, historyCount: 0 },
      { currentVersion: result.currentVersion, historyCount: result.versions.length }
    );

    expect(result.currentVersion).toBe(1);
    expect(result.versions).toHaveLength(0);
  });
});

// ==================== restoreVersion ====================
// 场景：恢复文档到指定历史版本
// 职责：所有权验证 → 版本验证 → 创建新版本记录 → 更新文档缓存字段
describe('documentService > restoreVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功恢复到历史版本
  it('should restore document to specified version', async () => {
    const currentDoc = { ...mockDocument, currentVersion: 3 };
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(currentDoc);
    vi.mocked(documentVersionRepository.findById).mockResolvedValue(mockDocumentVersion);
    vi.mocked(documentVersionRepository.create).mockResolvedValue({
      ...mockDocumentVersion,
      id: 'generated-uuid-123',
      version: 4,
    });
    vi.mocked(documentRepository.update).mockResolvedValue({
      ...mockDocument,
      currentVersion: 4, // version + 1
    });

    const result = await documentService.restoreVersion(mockDocumentId, mockVersionId, mockUserId);

    logTestInfo(
      { documentId: mockDocumentId, versionId: mockVersionId, targetVersion: 1 },
      { restoredCurrentVersion: 4 },
      { restoredCurrentVersion: result.currentVersion }
    );

    expect(result.currentVersion).toBe(4);
  });

  // 场景 2：恢复时创建新版本记录
  // changeNote 应为 "Restored from version X"
  it('should create new version with restore changeNote', async () => {
    const currentDoc = { ...mockDocument, currentVersion: 3 };
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(currentDoc);
    vi.mocked(documentVersionRepository.findById).mockResolvedValue({
      ...mockDocumentVersion,
      version: 1,
    });
    vi.mocked(documentVersionRepository.create).mockResolvedValue({
      ...mockDocumentVersion,
      id: 'generated-uuid-123',
    });
    vi.mocked(documentRepository.update).mockResolvedValue({
      ...mockDocument,
      currentVersion: 4,
    });

    await documentService.restoreVersion(mockDocumentId, mockVersionId, mockUserId);

    const createCall = vi.mocked(documentVersionRepository.create).mock.calls[0]?.[0];

    logTestInfo(
      { currentVersion: 3, targetVersion: 1 },
      {
        newVersion: 4,
        changeNote: 'Restored from version 1',
        source: 'restore',
      },
      {
        newVersion: createCall?.version,
        changeNote: createCall?.changeNote,
        source: createCall?.source,
      }
    );

    expect(createCall?.version).toBe(4);
    expect(createCall?.changeNote).toBe('Restored from version 1');
    expect(createCall?.source).toBe('restore');
    expect(createCall?.createdBy).toBe(mockUserId);
  });

  // 场景 3：使用目标版本的文件属性更新文档
  it('should update document with target version file properties', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue({
      ...mockDocument,
      currentVersion: 2,
    });
    vi.mocked(documentVersionRepository.findById).mockResolvedValue(mockDocumentVersion);
    vi.mocked(documentVersionRepository.create).mockResolvedValue({
      ...mockDocumentVersion,
      id: 'generated-uuid-123',
    });
    vi.mocked(documentRepository.update).mockResolvedValue({
      ...mockDocument,
      currentVersion: 3,
    });

    await documentService.restoreVersion(mockDocumentId, mockVersionId, mockUserId);

    logTestInfo(
      { targetVersion: mockDocumentVersion },
      {
        fileName: mockDocumentVersion.fileName,
        mimeType: mockDocumentVersion.mimeType,
        currentVersion: 3,
      },
      vi.mocked(documentRepository.update).mock.calls[0]?.[1]
    );

    expect(documentRepository.update).toHaveBeenCalledWith(
      mockDocumentId,
      expect.objectContaining({
        fileName: mockDocumentVersion.fileName,
        mimeType: mockDocumentVersion.mimeType,
        fileSize: mockDocumentVersion.fileSize,
        fileExtension: mockDocumentVersion.fileExtension,
        documentType: mockDocumentVersion.documentType,
        currentVersion: 3, // 2 + 1
        updatedBy: mockUserId,
      }),
      expect.anything() // tx parameter
    );
  });

  // 场景 4：文档不存在
  it('should throw DOCUMENT_NOT_FOUND when document does not exist', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await documentService.restoreVersion('nonexistent', mockVersionId, mockUserId);
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

  // 场景 5：版本记录不存在
  it('should throw DOCUMENT_NOT_FOUND when version does not exist', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentVersionRepository.findById).mockResolvedValue(undefined);

    let actual: { code: string; message: string } | null = null;
    try {
      await documentService.restoreVersion(mockDocumentId, 'nonexistent-version', mockUserId);
    } catch (error) {
      actual = { code: (error as AppError).code, message: (error as AppError).message };
    }

    logTestInfo(
      { versionId: 'nonexistent-version' },
      { code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND, message: 'Version not found' },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND);
    expect(actual?.message).toBe('Version not found');
  });

  // 场景 6：版本属于其他文档（documentId 不匹配）
  it('should throw DOCUMENT_NOT_FOUND when version belongs to another document', async () => {
    vi.mocked(documentRepository.findByIdAndUser).mockResolvedValue(mockDocument);
    vi.mocked(documentVersionRepository.findById).mockResolvedValue({
      ...mockDocumentVersion,
      documentId: 'other-document-id',
    });

    let actual: { code: string } | null = null;
    try {
      await documentService.restoreVersion(mockDocumentId, mockVersionId, mockUserId);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { documentId: mockDocumentId, versionDocumentId: 'other-document-id' },
      { code: DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.DOCUMENT_NOT_FOUND);
    expect(documentVersionRepository.create).not.toHaveBeenCalled();
    expect(documentRepository.update).not.toHaveBeenCalled();
  });
});
