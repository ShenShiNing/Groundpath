import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DOCUMENT_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@shared/errors';
import {
  mockUserId,
  mockFolderId,
  mockDocument,
  mockDocumentVersion,
  mockFolder,
  mockFile,
  mockTextFile,
  mockMarkdownFile,
  mockStorageResult,
  mockTextStorageResult,
  mockMarkdownStorageResult,
  mockKnowledgeBaseId,
  logTestInfo,
} from '@tests/__mocks__/document.mocks';

// ==================== Mocks ====================

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid-123'),
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

vi.mock('@modules/document/repositories/folder.repository', () => ({
  folderRepository: {
    findByIdAndUser: vi.fn(),
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
import { documentService } from '@modules/document/services/document.service';
import { documentRepository } from '@modules/document/repositories/document.repository';
import { documentVersionRepository } from '@modules/document/repositories/document-version.repository';
import { folderRepository } from '@modules/document/repositories/folder.repository';
import { documentStorageService } from '@modules/document/services/document-storage.service';
import { knowledgeBaseService } from '@modules/knowledge-base';

// ==================== upload ====================
// 场景：用户上传新文档
// 职责：文件验证 → 知识库验证 → 文件夹验证 → 上传到R2 → 文本提取 → 创建数据库记录
describe('documentService > upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for knowledgeBaseService.validateOwnership
    vi.mocked(knowledgeBaseService.validateOwnership).mockResolvedValue(undefined);
  });

  // 场景 1：成功上传 PDF 文档到指定文件夹
  // 应返回包含完整信息的 DocumentInfo
  it('should upload PDF document to specified folder successfully', async () => {
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockFolder);
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockStorageResult);
    vi.mocked(documentStorageService.extractTextContent).mockResolvedValue('Extracted PDF text');
    vi.mocked(documentRepository.create).mockResolvedValue({
      ...mockDocument,
      id: 'generated-uuid-123',
    });

    const result = await documentService.upload(mockUserId, mockFile, {
      title: 'My PDF',
      description: 'A test PDF',
      folderId: mockFolderId,
      knowledgeBaseId: mockKnowledgeBaseId,
    });

    logTestInfo(
      { userId: mockUserId, folderId: mockFolderId, fileName: mockFile.originalname },
      { id: 'generated-uuid-123', title: 'My PDF' },
      { id: result.id, title: result.title }
    );

    expect(knowledgeBaseService.validateOwnership).toHaveBeenCalledWith(
      mockKnowledgeBaseId,
      mockUserId
    );
    expect(documentStorageService.validateFile).toHaveBeenCalledWith(mockFile);
    expect(folderRepository.findByIdAndUser).toHaveBeenCalledWith(mockFolderId, mockUserId);
    expect(documentStorageService.uploadDocument).toHaveBeenCalledWith(mockUserId, mockFile);
    expect(documentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'generated-uuid-123',
        userId: mockUserId,
        folderId: mockFolderId,
        knowledgeBaseId: mockKnowledgeBaseId,
        title: 'My PDF',
        description: 'A test PDF',
        currentVersion: 1,
      })
    );
    expect(result.id).toBe('generated-uuid-123');
  });

  // 场景 2：上传到根目录（无 folderId）
  // 不应验证文件夹，folderId 应为 null
  it('should upload document to root when no folderId specified', async () => {
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockStorageResult);
    vi.mocked(documentStorageService.extractTextContent).mockResolvedValue(null);
    vi.mocked(documentRepository.create).mockResolvedValue({
      ...mockDocument,
      id: 'generated-uuid-123',
      folderId: null,
    });

    await documentService.upload(mockUserId, mockFile, { knowledgeBaseId: mockKnowledgeBaseId });

    logTestInfo(
      { folderId: 'undefined' },
      { folderValidated: false, folderIdInCreate: null },
      {
        folderValidated: vi.mocked(folderRepository.findByIdAndUser).mock.calls.length > 0,
        folderIdInCreate: vi.mocked(documentRepository.create).mock.calls[0]?.[0]?.folderId,
      }
    );

    expect(folderRepository.findByIdAndUser).not.toHaveBeenCalled();
    expect(documentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: null })
    );
  });

  // 场景 3：标题自动从文件名提取（去除扩展名）
  // 未提供 title 时，应从 originalname 中去除扩展名作为标题
  it('should extract title from filename when not provided', async () => {
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockStorageResult);
    vi.mocked(documentStorageService.extractTextContent).mockResolvedValue(null);
    vi.mocked(documentRepository.create).mockResolvedValue({
      ...mockDocument,
      id: 'generated-uuid-123',
      title: 'test',
    });

    await documentService.upload(mockUserId, mockFile, { knowledgeBaseId: mockKnowledgeBaseId });

    const createdTitle = vi.mocked(documentRepository.create).mock.calls[0]?.[0]?.title;
    logTestInfo(
      { originalname: 'test.pdf', providedTitle: 'none' },
      { extractedTitle: 'test' },
      { extractedTitle: createdTitle }
    );

    expect(createdTitle).toBe('test');
  });

  // 场景 4：上传纯文本文件 — 直接从 buffer 提取文本
  // text/plain 类型应直接 buffer.toString('utf-8')
  it('should extract text content directly for text files', async () => {
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockTextStorageResult);
    vi.mocked(documentVersionRepository.create).mockResolvedValue({
      ...mockDocumentVersion,
      documentType: 'text',
      textContent: 'Hello, this is plain text content.',
    });
    vi.mocked(documentRepository.create).mockResolvedValue({
      ...mockDocument,
      id: 'generated-uuid-123',
      documentType: 'text',
    });

    await documentService.upload(mockUserId, mockTextFile, {
      knowledgeBaseId: mockKnowledgeBaseId,
    });

    const versionCreateCall = vi.mocked(documentVersionRepository.create).mock.calls[0]?.[0];
    logTestInfo(
      { mimeType: 'text/plain' },
      { textContent: 'Hello, this is plain text content.' },
      { textContent: versionCreateCall?.textContent }
    );

    expect(versionCreateCall?.textContent).toBe('Hello, this is plain text content.');
    // 不应调用 extractTextContent（那是给 pdf/docx 用的）
    expect(documentStorageService.extractTextContent).not.toHaveBeenCalled();
  });

  // 场景 5：上传 Markdown 文件 — 直接从 buffer 提取文本
  it('should extract text content directly for markdown files', async () => {
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockMarkdownStorageResult);
    vi.mocked(documentVersionRepository.create).mockResolvedValue({
      ...mockDocumentVersion,
      documentType: 'markdown',
    });
    vi.mocked(documentRepository.create).mockResolvedValue({
      ...mockDocument,
      id: 'generated-uuid-123',
      documentType: 'markdown',
    });

    await documentService.upload(mockUserId, mockMarkdownFile, {
      knowledgeBaseId: mockKnowledgeBaseId,
    });

    const versionCreateCall = vi.mocked(documentVersionRepository.create).mock.calls[0]?.[0];
    logTestInfo(
      { mimeType: 'text/markdown' },
      { textContent: '# Title\n\nThis is markdown content.' },
      { textContent: versionCreateCall?.textContent }
    );

    expect(versionCreateCall?.textContent).toBe('# Title\n\nThis is markdown content.');
    expect(documentStorageService.extractTextContent).not.toHaveBeenCalled();
  });

  // 场景 6：上传 PDF 文件 — 通过 storage service 提取文本
  it('should use extractTextContent for PDF files', async () => {
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockStorageResult);
    vi.mocked(documentStorageService.extractTextContent).mockResolvedValue('PDF extracted text');
    vi.mocked(documentRepository.create).mockResolvedValue({
      ...mockDocument,
      id: 'generated-uuid-123',
    });

    await documentService.upload(mockUserId, mockFile, { knowledgeBaseId: mockKnowledgeBaseId });

    logTestInfo(
      { documentType: 'pdf' },
      { extractTextCalled: true },
      {
        extractTextCalled:
          vi.mocked(documentStorageService.extractTextContent).mock.calls.length > 0,
      }
    );

    expect(documentStorageService.extractTextContent).toHaveBeenCalledWith(
      mockStorageResult.storageKey,
      'pdf'
    );
  });

  // 场景 7：文本内容超过 50000 字符时截断
  it('should truncate text content exceeding 50000 characters', async () => {
    const longContent = 'a'.repeat(60000);
    const longTextFile = {
      buffer: Buffer.from(longContent),
      originalname: 'long.txt',
      mimetype: 'text/plain',
      size: 60000,
    };

    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockTextStorageResult);
    vi.mocked(documentVersionRepository.create).mockResolvedValue({
      ...mockDocumentVersion,
      documentType: 'text',
    });
    vi.mocked(documentRepository.create).mockResolvedValue({
      ...mockDocument,
      id: 'generated-uuid-123',
    });

    await documentService.upload(mockUserId, longTextFile, {
      knowledgeBaseId: mockKnowledgeBaseId,
    });

    const versionCreateCall = vi.mocked(documentVersionRepository.create).mock.calls[0]?.[0];
    logTestInfo(
      { originalLength: 60000 },
      { truncatedLength: 50000 },
      { truncatedLength: versionCreateCall?.textContent?.length }
    );

    expect(versionCreateCall?.textContent?.length).toBe(50000);
  });

  // 场景 8：不支持的文件类型 — validateFile 返回无效
  // 应抛出 INVALID_FILE_TYPE 错误
  it('should throw INVALID_FILE_TYPE for unsupported MIME types', async () => {
    vi.mocked(documentStorageService.validateFile).mockReturnValue({
      valid: false,
      error: 'Invalid file type. Allowed: application/pdf, text/markdown, text/plain',
    });

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await documentService.upload(
        mockUserId,
        {
          buffer: Buffer.from('exe'),
          originalname: 'test.exe',
          mimetype: 'application/x-msdownload',
          size: 1024,
        },
        { knowledgeBaseId: mockKnowledgeBaseId }
      );
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    logTestInfo(
      { mimetype: 'application/x-msdownload' },
      { code: DOCUMENT_ERROR_CODES.INVALID_FILE_TYPE, statusCode: 400 },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.INVALID_FILE_TYPE);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 9：目标文件夹不存在
  // 应抛出 FOLDER_NOT_FOUND 错误
  it('should throw FOLDER_NOT_FOUND when target folder does not exist', async () => {
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await documentService.upload(mockUserId, mockFile, {
        folderId: 'nonexistent-folder',
        knowledgeBaseId: mockKnowledgeBaseId,
      });
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    logTestInfo(
      { folderId: 'nonexistent-folder' },
      { code: DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND, statusCode: 404 },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND);
    expect(actual?.statusCode).toBe(404);
    // 不应尝试上传文件
    expect(documentStorageService.uploadDocument).not.toHaveBeenCalled();
  });

  // 场景 10：currentVersion 初始值为 1
  it('should set initial currentVersion to 1', async () => {
    vi.mocked(documentStorageService.validateFile).mockReturnValue({ valid: true });
    vi.mocked(documentStorageService.uploadDocument).mockResolvedValue(mockStorageResult);
    vi.mocked(documentStorageService.extractTextContent).mockResolvedValue(null);
    vi.mocked(documentVersionRepository.create).mockResolvedValue(mockDocumentVersion);
    vi.mocked(documentRepository.create).mockResolvedValue({
      ...mockDocument,
      id: 'generated-uuid-123',
      currentVersion: 1,
    });

    await documentService.upload(mockUserId, mockFile, { knowledgeBaseId: mockKnowledgeBaseId });

    const createCall = vi.mocked(documentRepository.create).mock.calls[0]?.[0];
    logTestInfo({}, { currentVersion: 1 }, { currentVersion: createCall?.currentVersion });

    expect(createCall?.currentVersion).toBe(1);
    expect(createCall?.createdBy).toBe(mockUserId);
  });
});
