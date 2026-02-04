import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DOCUMENT_ERROR_CODES } from '@knowledge-agent/shared';
import { AppError } from '@shared/errors';
import {
  mockUserId,
  mockFolderId,
  mockFolder,
  mockChildFolder,
  mockGrandchildFolder,
  mockKnowledgeBaseId,
  mockKnowledgeBase,
  logTestInfo,
} from '@tests/__mocks__/document.mocks';

// ==================== Mocks ====================

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid-123'),
}));

vi.mock('@modules/document/repositories/folder.repository', () => ({
  folderRepository: {
    create: vi.fn(),
    findByIdAndUser: vi.fn(),
    findById: vi.fn(),
    listByUser: vi.fn(),
    listByParent: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    countChildren: vi.fn(),
    countDocuments: vi.fn(),
    getWithCounts: vi.fn(),
    isAncestorOf: vi.fn(),
    buildPath: vi.fn(),
    updateDescendantPaths: vi.fn(),
  },
}));

vi.mock('@modules/document/repositories/document.repository', () => ({
  documentRepository: {
    moveAllFromFolderToRoot: vi.fn(),
  },
}));

// Mock shared logger to avoid circular dependencies
vi.mock('@shared/logger', () => ({
  createLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock @modules/user to avoid circular import issues
vi.mock('@modules/user', () => ({
  userService: {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    updateLastLogin: vi.fn(),
  },
  userRepository: {
    findById: vi.fn(),
    findByEmail: vi.fn(),
  },
}));

// Mock knowledge base service
vi.mock('@modules/knowledge-base', () => ({
  knowledgeBaseService: {
    validateOwnership: vi.fn(),
    getEmbeddingConfig: vi.fn(),
    incrementDocumentCount: vi.fn(),
    incrementTotalChunks: vi.fn(),
  },
}));

// Import after mocks
import { folderService } from '@modules/document';
import { folderRepository } from '@modules/document';
import { documentRepository } from '@modules/document';
import { knowledgeBaseService } from '@modules/knowledge-base';

// ==================== create ====================
// 场景：创建文件夹
// 职责：验证知识库 → 验证父级文件夹 → 构建路径 → 创建数据库记录
describe('folderService > create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for knowledgeBaseService.validateOwnership
    vi.mocked(knowledgeBaseService.validateOwnership).mockResolvedValue(mockKnowledgeBase);
  });

  // 场景 1：创建根文件夹（无 parentId）
  it('should create root folder successfully', async () => {
    vi.mocked(folderRepository.buildPath).mockResolvedValue('/');
    vi.mocked(folderRepository.create).mockResolvedValue(mockFolder);

    const result = await folderService.create(mockUserId, {
      name: 'Test Folder',
      knowledgeBaseId: mockKnowledgeBaseId,
    });

    logTestInfo(
      { name: 'Test Folder', parentId: undefined },
      { id: mockFolderId, path: '/' },
      { id: result.id, path: result.path }
    );

    expect(knowledgeBaseService.validateOwnership).toHaveBeenCalledWith(
      mockKnowledgeBaseId,
      mockUserId
    );
    expect(result.id).toBe(mockFolderId);
    expect(result.path).toBe('/');
    expect(folderRepository.findByIdAndUser).not.toHaveBeenCalled();
    expect(folderRepository.buildPath).toHaveBeenCalledWith(null);
  });

  // 场景 2：创建子文件夹
  it('should create child folder with valid parent', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockFolder);
    vi.mocked(folderRepository.buildPath).mockResolvedValue(`/${mockFolderId}/`);
    vi.mocked(folderRepository.create).mockResolvedValue(mockChildFolder);

    const result = await folderService.create(mockUserId, {
      name: 'Child Folder',
      parentId: mockFolderId,
      knowledgeBaseId: mockKnowledgeBaseId,
    });

    logTestInfo(
      { name: 'Child Folder', parentId: mockFolderId },
      { parentId: mockFolderId, path: `/${mockFolderId}/` },
      { parentId: result.parentId, path: result.path }
    );

    expect(result.parentId).toBe(mockFolderId);
    expect(result.path).toBe(`/${mockFolderId}/`);
    expect(folderRepository.findByIdAndUser).toHaveBeenCalledWith(mockFolderId, mockUserId);
  });

  // 场景 3：父文件夹不存在
  it('should throw FOLDER_NOT_FOUND when parent does not exist', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await folderService.create(mockUserId, {
        name: 'Orphan',
        parentId: 'nonexistent-parent',
        knowledgeBaseId: mockKnowledgeBaseId,
      });
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    logTestInfo(
      { parentId: 'nonexistent-parent' },
      { code: DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND, statusCode: 404 },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND);
    expect(actual?.statusCode).toBe(404);
    expect(folderRepository.create).not.toHaveBeenCalled();
  });

  // 场景 4：只传递 name 时应正确创建
  it('should create folder with only name', async () => {
    vi.mocked(folderRepository.buildPath).mockResolvedValue('/');
    vi.mocked(folderRepository.create).mockResolvedValue({
      ...mockFolder,
      name: 'No Desc',
    });

    const result = await folderService.create(mockUserId, {
      name: 'No Desc',
      knowledgeBaseId: mockKnowledgeBaseId,
    });

    const createCall = vi.mocked(folderRepository.create).mock.calls[0]?.[0];
    logTestInfo({ name: 'No Desc' }, { name: 'No Desc' }, { name: createCall?.name });

    expect(result.name).toBe('No Desc');
  });
});

// ==================== getById ====================
// 场景：获取文件夹详情（含文档数和子文件夹数）
describe('folderService > getById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：成功获取（含计数）
  it('should return folder with document and child folder counts', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockFolder);
    vi.mocked(folderRepository.getWithCounts).mockResolvedValue({
      ...mockFolder,
      documentCount: 5,
      childFolderCount: 2,
    });

    const result = await folderService.getById(mockFolderId, mockUserId);

    logTestInfo(
      { folderId: mockFolderId },
      { documentCount: 5, childFolderCount: 2 },
      { documentCount: result.documentCount, childFolderCount: result.childFolderCount }
    );

    expect(result.documentCount).toBe(5);
    expect(result.childFolderCount).toBe(2);
    expect(result.id).toBe(mockFolderId);
  });

  // 场景 2：文件夹不存在
  it('should throw FOLDER_NOT_FOUND when folder does not exist', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await folderService.getById('nonexistent', mockUserId);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { folderId: 'nonexistent' },
      { code: DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND);
  });
});

// ==================== list & getTree ====================
describe('folderService > list & getTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：列出用户所有文件夹（平面列表）
  it('should return flat list of FolderInfo for user', async () => {
    vi.mocked(folderRepository.listByUser).mockResolvedValue([mockFolder, mockChildFolder]);

    const result = await folderService.list(mockUserId);

    logTestInfo({ userId: mockUserId }, { count: 2 }, { count: result.length });

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(mockFolderId);
    expect(result[1]!.id).toBe('folder-child-1');
    // FolderInfo 不应包含审计字段
    expect('createdBy' in result[0]!).toBe(false);
    expect('deletedAt' in result[0]!).toBe(false);
  });

  // 场景 2：构建文件夹树
  it('should build folder tree with correct parent-child relationships', async () => {
    vi.mocked(folderRepository.listByUser).mockResolvedValue([
      mockFolder,
      mockChildFolder,
      mockGrandchildFolder,
    ]);

    const result = await folderService.getTree(mockUserId);

    logTestInfo(
      { totalFolders: 3 },
      { rootCount: 1, rootChildrenCount: 1 },
      { rootCount: result.length, rootChildrenCount: result[0]?.children.length }
    );

    // 根节点
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(mockFolderId);

    // 子节点
    expect(result[0]!.children).toHaveLength(1);
    expect(result[0]!.children[0]!.id).toBe('folder-child-1');

    // 孙节点
    expect(result[0]!.children[0]!.children).toHaveLength(1);
    expect(result[0]!.children[0]!.children[0]!.id).toBe('folder-grandchild-1');
  });

  // 场景 3：空文件夹列表
  it('should handle empty folder list for tree', async () => {
    vi.mocked(folderRepository.listByUser).mockResolvedValue([]);

    const result = await folderService.getTree(mockUserId);

    logTestInfo({ userId: mockUserId }, { rootCount: 0 }, { rootCount: result.length });

    expect(result).toHaveLength(0);
  });

  // 场景 4：多个根文件夹（森林结构）
  it('should handle multiple root folders (forest)', async () => {
    const secondRoot = { ...mockFolder, id: 'folder-root-2', name: 'Second Root' };
    vi.mocked(folderRepository.listByUser).mockResolvedValue([mockFolder, secondRoot]);

    const result = await folderService.getTree(mockUserId);

    logTestInfo({ totalFolders: 2, allRoot: true }, { rootCount: 2 }, { rootCount: result.length });

    expect(result).toHaveLength(2);
  });
});

// ==================== listChildren ====================
describe('folderService > listChildren', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：列出子文件夹
  it('should return child folders of specified parent', async () => {
    vi.mocked(folderRepository.listByParent).mockResolvedValue([mockChildFolder]);

    const result = await folderService.listChildren(mockUserId, mockFolderId);

    logTestInfo({ parentId: mockFolderId }, { childCount: 1 }, { childCount: result.length });

    expect(result).toHaveLength(1);
    expect(result[0]!.parentId).toBe(mockFolderId);
    expect(folderRepository.listByParent).toHaveBeenCalledWith(mockUserId, mockFolderId);
  });

  // 场景 2：列出根级文件夹（parentId = null）
  it('should list root folders when parentId is null', async () => {
    vi.mocked(folderRepository.listByParent).mockResolvedValue([mockFolder]);

    const result = await folderService.listChildren(mockUserId, null);

    logTestInfo({ parentId: null }, { count: 1 }, { count: result.length });

    expect(folderRepository.listByParent).toHaveBeenCalledWith(mockUserId, null);
    expect(result).toHaveLength(1);
  });
});

// ==================== update ====================
// 场景：更新文件夹
// 职责：所有权验证 → 循环引用检查 → 路径更新 → 后代路径更新
describe('folderService > update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：更新文件夹名称
  it('should update folder name', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockFolder);
    vi.mocked(folderRepository.update).mockResolvedValue({
      ...mockFolder,
      name: 'Renamed Folder',
    });

    const result = await folderService.update(mockFolderId, mockUserId, {
      name: 'Renamed Folder',
    });

    logTestInfo({ name: 'Renamed Folder' }, { name: 'Renamed Folder' }, { name: result.name });

    expect(result.name).toBe('Renamed Folder');
    expect(folderRepository.update).toHaveBeenCalledWith(
      mockFolderId,
      expect.objectContaining({ name: 'Renamed Folder', updatedBy: mockUserId })
    );
  });

  // 场景 2：自引用检测 — 不能将文件夹设为自己的父级
  it('should throw CIRCULAR_REFERENCE when setting folder as its own parent', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockFolder);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await folderService.update(mockFolderId, mockUserId, { parentId: mockFolderId });
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    logTestInfo(
      { folderId: mockFolderId, parentId: mockFolderId },
      { code: DOCUMENT_ERROR_CODES.CIRCULAR_REFERENCE, statusCode: 400 },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.CIRCULAR_REFERENCE);
    expect(actual?.statusCode).toBe(400);
  });

  // 场景 3：后代循环引用检测 — 不能将文件夹移到其后代下
  it('should throw CIRCULAR_REFERENCE when moving folder to its descendant', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockFolder);
    vi.mocked(folderRepository.isAncestorOf).mockResolvedValue(true);

    let actual: { code: string; message: string } | null = null;
    try {
      await folderService.update(mockFolderId, mockUserId, { parentId: 'folder-child-1' });
    } catch (error) {
      actual = { code: (error as AppError).code, message: (error as AppError).message };
    }

    logTestInfo(
      { folderId: mockFolderId, parentId: 'folder-child-1' },
      { code: DOCUMENT_ERROR_CODES.CIRCULAR_REFERENCE },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.CIRCULAR_REFERENCE);
    expect(actual?.message).toContain('descendants');
    expect(folderRepository.isAncestorOf).toHaveBeenCalledWith(mockFolderId, 'folder-child-1');
  });

  // 场景 4：新父文件夹不存在
  it('should throw FOLDER_NOT_FOUND when new parent does not exist', async () => {
    vi.mocked(folderRepository.findByIdAndUser)
      .mockResolvedValueOnce(mockFolder) // 当前文件夹存在
      .mockResolvedValueOnce(undefined); // 新父文件夹不存在
    vi.mocked(folderRepository.isAncestorOf).mockResolvedValue(false);

    let actual: { code: string } | null = null;
    try {
      await folderService.update(mockFolderId, mockUserId, { parentId: 'nonexistent-parent' });
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { parentId: 'nonexistent-parent' },
      { code: DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND);
  });

  // 场景 5：移动文件夹到新父级 — 更新路径和后代路径
  it('should update path and descendant paths when parent changes', async () => {
    const newParent = { ...mockFolder, id: 'new-parent-id', name: 'New Parent' };
    vi.mocked(folderRepository.findByIdAndUser)
      .mockResolvedValueOnce(mockChildFolder) // 当前文件夹
      .mockResolvedValueOnce(newParent); // 新父文件夹
    vi.mocked(folderRepository.isAncestorOf).mockResolvedValue(false);
    vi.mocked(folderRepository.buildPath).mockResolvedValue('/new-parent-id/');
    vi.mocked(folderRepository.update).mockResolvedValue({
      ...mockChildFolder,
      parentId: 'new-parent-id',
      path: '/new-parent-id/',
    });
    vi.mocked(folderRepository.updateDescendantPaths).mockResolvedValue(undefined);

    await folderService.update('folder-child-1', mockUserId, { parentId: 'new-parent-id' });

    logTestInfo(
      { folderId: 'folder-child-1', newParentId: 'new-parent-id' },
      { pathUpdated: true, descendantPathsUpdated: true },
      {
        pathUpdated: vi.mocked(folderRepository.buildPath).mock.calls.length > 0,
        descendantPathsUpdated:
          vi.mocked(folderRepository.updateDescendantPaths).mock.calls.length > 0,
      }
    );

    expect(folderRepository.buildPath).toHaveBeenCalledWith('new-parent-id');
    expect(folderRepository.update).toHaveBeenCalledWith(
      'folder-child-1',
      expect.objectContaining({ parentId: 'new-parent-id', path: '/new-parent-id/' })
    );
    expect(folderRepository.updateDescendantPaths).toHaveBeenCalledWith(
      'folder-child-1',
      mockUserId
    );
  });

  // 场景 6：移动到根目录（parentId = null）
  // 不应检查后代循环引用，不应验证父文件夹
  it('should allow moving folder to root (parentId: null)', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockChildFolder);
    vi.mocked(folderRepository.buildPath).mockResolvedValue('/');
    vi.mocked(folderRepository.update).mockResolvedValue({
      ...mockChildFolder,
      parentId: null,
      path: '/',
    });
    vi.mocked(folderRepository.updateDescendantPaths).mockResolvedValue(undefined);

    const result = await folderService.update('folder-child-1', mockUserId, { parentId: null });

    logTestInfo(
      { parentId: null },
      { isAncestorChecked: false },
      { isAncestorChecked: vi.mocked(folderRepository.isAncestorOf).mock.calls.length > 0 }
    );

    expect(folderRepository.isAncestorOf).not.toHaveBeenCalled();
    expect(result.path).toBe('/');
  });

  // 场景 7：parentId 未变化时不更新路径
  it('should not update paths when parentId is not changed', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockChildFolder);
    vi.mocked(folderRepository.update).mockResolvedValue({
      ...mockChildFolder,
      name: 'Updated Name',
    });

    await folderService.update('folder-child-1', mockUserId, { name: 'Updated Name' });

    logTestInfo(
      { name: 'Updated Name', parentId: 'not provided' },
      { buildPathCalled: false, updateDescendantsCalled: false },
      {
        buildPathCalled: vi.mocked(folderRepository.buildPath).mock.calls.length > 0,
        updateDescendantsCalled:
          vi.mocked(folderRepository.updateDescendantPaths).mock.calls.length > 0,
      }
    );

    expect(folderRepository.buildPath).not.toHaveBeenCalled();
    expect(folderRepository.updateDescendantPaths).not.toHaveBeenCalled();
  });

  // 场景 8：文件夹不存在
  it('should throw FOLDER_NOT_FOUND when folder does not exist', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await folderService.update('nonexistent', mockUserId, { name: 'New' });
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { folderId: 'nonexistent' },
      { code: DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND);
  });
});

// ==================== delete ====================
// 场景：删除文件夹（软删除）
// 职责：所有权验证 → 内容检查 → 可选移动内容到根目录 → 软删除
describe('folderService > delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 场景 1：删除空文件夹
  it('should soft delete empty folder', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockFolder);
    vi.mocked(folderRepository.countDocuments).mockResolvedValue(0);
    vi.mocked(folderRepository.countChildren).mockResolvedValue(0);
    vi.mocked(folderRepository.softDelete).mockResolvedValue(undefined);

    await folderService.delete(mockFolderId, mockUserId);

    logTestInfo(
      { folderId: mockFolderId, documentCount: 0, childCount: 0 },
      { softDeleted: true },
      { softDeleted: vi.mocked(folderRepository.softDelete).mock.calls.length > 0 }
    );

    expect(folderRepository.softDelete).toHaveBeenCalledWith(mockFolderId, mockUserId);
  });

  // 场景 2：非空文件夹，未设 moveContentsToRoot — 抛出 FOLDER_NOT_EMPTY
  it('should throw FOLDER_NOT_EMPTY when folder has contents and no moveContentsToRoot', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockFolder);
    vi.mocked(folderRepository.countDocuments).mockResolvedValue(3);
    vi.mocked(folderRepository.countChildren).mockResolvedValue(1);

    let actual: { code: string; statusCode: number } | null = null;
    try {
      await folderService.delete(mockFolderId, mockUserId);
    } catch (error) {
      actual = { code: (error as AppError).code, statusCode: (error as AppError).statusCode };
    }

    logTestInfo(
      { documentCount: 3, childCount: 1, moveContentsToRoot: false },
      { code: DOCUMENT_ERROR_CODES.FOLDER_NOT_EMPTY, statusCode: 400 },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.FOLDER_NOT_EMPTY);
    expect(actual?.statusCode).toBe(400);
    expect(folderRepository.softDelete).not.toHaveBeenCalled();
  });

  // 场景 3：非空文件夹，moveContentsToRoot = true
  // 应移动文档到根目录，移动子文件夹到根目录，然后软删除
  it('should move contents to root and soft delete when moveContentsToRoot is true', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockFolder);
    vi.mocked(folderRepository.countDocuments).mockResolvedValue(2);
    vi.mocked(folderRepository.countChildren).mockResolvedValue(1);
    vi.mocked(documentRepository.moveAllFromFolderToRoot).mockResolvedValue(undefined);
    vi.mocked(folderRepository.listByParent).mockResolvedValue([mockChildFolder]);
    vi.mocked(folderRepository.update).mockResolvedValue({
      ...mockChildFolder,
      parentId: null,
      path: '/',
    });
    vi.mocked(folderRepository.updateDescendantPaths).mockResolvedValue(undefined);
    vi.mocked(folderRepository.softDelete).mockResolvedValue(undefined);

    await folderService.delete(mockFolderId, mockUserId, { moveContentsToRoot: true });

    logTestInfo(
      { documentCount: 2, childCount: 1, moveContentsToRoot: true },
      { docsMovedToRoot: true, childMovedToRoot: true, softDeleted: true },
      {
        docsMovedToRoot:
          vi.mocked(documentRepository.moveAllFromFolderToRoot).mock.calls.length > 0,
        childMovedToRoot: vi.mocked(folderRepository.update).mock.calls.length > 0,
        softDeleted: vi.mocked(folderRepository.softDelete).mock.calls.length > 0,
      }
    );

    // 文档移到根目录
    expect(documentRepository.moveAllFromFolderToRoot).toHaveBeenCalledWith(
      mockFolderId,
      mockUserId
    );

    // 子文件夹移到根目录
    expect(folderRepository.update).toHaveBeenCalledWith(
      'folder-child-1',
      expect.objectContaining({ parentId: null, path: '/', updatedBy: mockUserId })
    );

    // 更新子文件夹的后代路径
    expect(folderRepository.updateDescendantPaths).toHaveBeenCalledWith(
      'folder-child-1',
      mockUserId
    );

    // 最终软删除
    expect(folderRepository.softDelete).toHaveBeenCalledWith(mockFolderId, mockUserId);
  });

  // 场景 4：仅有文档（无子文件夹）
  it('should handle folder with only documents (no child folders)', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(mockFolder);
    vi.mocked(folderRepository.countDocuments).mockResolvedValue(5);
    vi.mocked(folderRepository.countChildren).mockResolvedValue(0);
    vi.mocked(documentRepository.moveAllFromFolderToRoot).mockResolvedValue(undefined);
    vi.mocked(folderRepository.listByParent).mockResolvedValue([]); // 无子文件夹
    vi.mocked(folderRepository.softDelete).mockResolvedValue(undefined);

    await folderService.delete(mockFolderId, mockUserId, { moveContentsToRoot: true });

    logTestInfo(
      { documentCount: 5, childCount: 0, moveContentsToRoot: true },
      { docsMovedToRoot: true, noChildUpdate: true },
      {
        docsMovedToRoot:
          vi.mocked(documentRepository.moveAllFromFolderToRoot).mock.calls.length > 0,
        noChildUpdate: vi.mocked(folderRepository.update).mock.calls.length === 0,
      }
    );

    expect(documentRepository.moveAllFromFolderToRoot).toHaveBeenCalled();
    expect(folderRepository.update).not.toHaveBeenCalled();
    expect(folderRepository.softDelete).toHaveBeenCalled();
  });

  // 场景 5：文件夹不存在
  it('should throw FOLDER_NOT_FOUND when folder does not exist', async () => {
    vi.mocked(folderRepository.findByIdAndUser).mockResolvedValue(undefined);

    let actual: { code: string } | null = null;
    try {
      await folderService.delete('nonexistent', mockUserId);
    } catch (error) {
      actual = { code: (error as AppError).code };
    }

    logTestInfo(
      { folderId: 'nonexistent' },
      { code: DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND },
      actual
    );

    expect(actual?.code).toBe(DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND);
  });
});
