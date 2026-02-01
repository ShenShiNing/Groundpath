import { v4 as uuidv4 } from 'uuid';
import { DOCUMENT_ERROR_CODES } from '@knowledge-agent/shared';
import type {
  FolderInfo,
  FolderWithCounts,
  FolderTreeNode,
  CreateFolderRequest,
  UpdateFolderRequest,
} from '@knowledge-agent/shared/types';
import type { Folder } from '@shared/db/schema/document/folders.schema';
import { AuthError } from '@shared/errors/errors';
import { folderRepository } from '../repositories/folder.repository';
import { documentRepository } from '../repositories/document.repository';
import { logOperation } from '@shared/logger/operation-logger';
import type { RequestContext } from './document.service';
import { knowledgeBaseService } from '@modules/knowledge-base';

/**
 * Convert database folder to API folder info
 */
function toFolderInfo(folder: Folder): FolderInfo {
  return {
    id: folder.id,
    userId: folder.userId,
    parentId: folder.parentId,
    name: folder.name,
    path: folder.path,
    knowledgeBaseId: folder.knowledgeBaseId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

/**
 * Convert folder to folder with counts
 */
function toFolderWithCounts(
  folder: Folder & { documentCount: number; childFolderCount: number }
): FolderWithCounts {
  return {
    ...toFolderInfo(folder),
    documentCount: folder.documentCount,
    childFolderCount: folder.childFolderCount,
  };
}

/**
 * Build folder tree from flat list
 */
function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const folderMap = new Map<string, FolderTreeNode>();
  const rootFolders: FolderTreeNode[] = [];

  // First pass: create nodes
  for (const folder of folders) {
    folderMap.set(folder.id, {
      ...toFolderInfo(folder),
      children: [],
    });
  }

  // Second pass: build tree
  for (const folder of folders) {
    const node = folderMap.get(folder.id)!;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children.push(node);
    } else {
      rootFolders.push(node);
    }
  }

  return rootFolders;
}

/**
 * Folder service for business logic
 */
export const folderService = {
  /**
   * Create a new folder
   */
  async create(
    userId: string,
    data: CreateFolderRequest,
    ctx?: RequestContext
  ): Promise<FolderInfo> {
    const startTime = Date.now();

    // Validate knowledge base exists and belongs to user
    await knowledgeBaseService.validateOwnership(data.knowledgeBaseId, userId);

    // Validate parent folder if specified
    if (data.parentId) {
      const parent = await folderRepository.findByIdAndUser(data.parentId, userId);
      if (!parent) {
        throw new AuthError(
          DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND as 'FOLDER_NOT_FOUND',
          'Parent folder not found',
          404
        );
      }
      // Ensure parent is in the same knowledge base
      if (parent.knowledgeBaseId !== data.knowledgeBaseId) {
        throw new AuthError(
          DOCUMENT_ERROR_CODES.ACCESS_DENIED as 'ACCESS_DENIED',
          'Parent folder does not belong to this knowledge base',
          400
        );
      }
    }

    // Build path
    const path = await folderRepository.buildPath(data.parentId ?? null);

    const folderId = uuidv4();
    const folder = await folderRepository.create({
      id: folderId,
      userId,
      parentId: data.parentId ?? null,
      name: data.name,
      path,
      knowledgeBaseId: data.knowledgeBaseId,
      createdBy: userId,
    });

    // Log operation
    logOperation({
      userId,
      resourceType: 'folder',
      resourceId: folderId,
      resourceName: data.name,
      action: 'folder.create',
      description: `Created folder: ${data.name}`,
      metadata: {
        parentId: data.parentId ?? null,
        path,
        knowledgeBaseId: data.knowledgeBaseId,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return toFolderInfo(folder);
  },

  /**
   * Get folder by ID (with ownership check)
   */
  async getById(folderId: string, userId: string): Promise<FolderWithCounts> {
    const folder = await folderRepository.findByIdAndUser(folderId, userId);
    if (!folder) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND as 'FOLDER_NOT_FOUND',
        'Folder not found',
        404
      );
    }

    const withCounts = await folderRepository.getWithCounts(folder);
    return toFolderWithCounts(withCounts);
  },

  /**
   * List all folders for a user (flat list)
   */
  async list(userId: string): Promise<FolderInfo[]> {
    const folders = await folderRepository.listByUser(userId);
    return folders.map(toFolderInfo);
  },

  /**
   * List all folders in a knowledge base (flat list)
   */
  async listByKnowledgeBase(knowledgeBaseId: string, userId: string): Promise<FolderInfo[]> {
    // Validate knowledge base ownership
    await knowledgeBaseService.validateOwnership(knowledgeBaseId, userId);

    const folders = await folderRepository.listByKnowledgeBase(knowledgeBaseId, userId);
    return folders.map(toFolderInfo);
  },

  /**
   * Get folder tree for a user
   */
  async getTree(userId: string): Promise<FolderTreeNode[]> {
    const folders = await folderRepository.listByUser(userId);
    return buildFolderTree(folders);
  },

  /**
   * Get folder tree for a knowledge base
   */
  async getTreeByKnowledgeBase(knowledgeBaseId: string, userId: string): Promise<FolderTreeNode[]> {
    // Validate knowledge base ownership
    await knowledgeBaseService.validateOwnership(knowledgeBaseId, userId);

    const folders = await folderRepository.listByKnowledgeBase(knowledgeBaseId, userId);
    return buildFolderTree(folders);
  },

  /**
   * List child folders of a parent
   */
  async listChildren(userId: string, parentId: string | null): Promise<FolderInfo[]> {
    const folders = await folderRepository.listByParent(userId, parentId);
    return folders.map(toFolderInfo);
  },

  /**
   * Update folder
   */
  async update(
    folderId: string,
    userId: string,
    data: UpdateFolderRequest,
    ctx?: RequestContext
  ): Promise<FolderInfo> {
    const startTime = Date.now();
    const folder = await folderRepository.findByIdAndUser(folderId, userId);
    if (!folder) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND as 'FOLDER_NOT_FOUND',
        'Folder not found',
        404
      );
    }

    // Check for circular reference if changing parent
    if (data.parentId !== undefined) {
      if (data.parentId === folderId) {
        throw new AuthError(
          DOCUMENT_ERROR_CODES.CIRCULAR_REFERENCE as 'CIRCULAR_REFERENCE',
          'A folder cannot be its own parent',
          400
        );
      }

      if (data.parentId) {
        const isDescendant = await folderRepository.isAncestorOf(folderId, data.parentId);
        if (isDescendant) {
          throw new AuthError(
            DOCUMENT_ERROR_CODES.CIRCULAR_REFERENCE as 'CIRCULAR_REFERENCE',
            'Cannot move folder to one of its descendants',
            400
          );
        }

        const parent = await folderRepository.findByIdAndUser(data.parentId, userId);
        if (!parent) {
          throw new AuthError(
            DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND as 'FOLDER_NOT_FOUND',
            'Parent folder not found',
            404
          );
        }
      }
    }

    // Capture old values for logging
    const oldValue = {
      name: folder.name,
      parentId: folder.parentId,
      path: folder.path,
    };

    // Build new path if parent changed
    let newPath = folder.path;
    if (data.parentId !== undefined && data.parentId !== folder.parentId) {
      newPath = await folderRepository.buildPath(data.parentId);
    }

    const updated = await folderRepository.update(folderId, {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.parentId !== undefined && { parentId: data.parentId, path: newPath }),
      updatedBy: userId,
    });

    // Update paths of all descendants if folder was moved
    if (data.parentId !== undefined && data.parentId !== folder.parentId) {
      await folderRepository.updateDescendantPaths(folderId, userId);
    }

    // Log operation
    logOperation({
      userId,
      resourceType: 'folder',
      resourceId: folderId,
      resourceName: updated!.name,
      action: 'folder.update',
      description: 'Updated folder',
      oldValue,
      newValue: {
        name: data.name ?? folder.name,
        parentId: data.parentId ?? folder.parentId,
        path: newPath,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });

    return toFolderInfo(updated!);
  },

  /**
   * Delete folder (soft delete)
   */
  async delete(
    folderId: string,
    userId: string,
    options?: { moveContentsToRoot?: boolean },
    ctx?: RequestContext
  ): Promise<void> {
    const startTime = Date.now();
    const folder = await folderRepository.findByIdAndUser(folderId, userId);
    if (!folder) {
      throw new AuthError(
        DOCUMENT_ERROR_CODES.FOLDER_NOT_FOUND as 'FOLDER_NOT_FOUND',
        'Folder not found',
        404
      );
    }

    const [documentCount, childCount] = await Promise.all([
      folderRepository.countDocuments(folderId),
      folderRepository.countChildren(folderId),
    ]);

    if (documentCount > 0 || childCount > 0) {
      if (options?.moveContentsToRoot) {
        await documentRepository.moveAllFromFolderToRoot(folderId, userId);

        const children = await folderRepository.listByParent(userId, folderId);
        for (const child of children) {
          await folderRepository.update(child.id, {
            parentId: null,
            path: '/',
            updatedBy: userId,
          });
          await folderRepository.updateDescendantPaths(child.id, userId);
        }
      } else {
        throw new AuthError(
          DOCUMENT_ERROR_CODES.FOLDER_NOT_EMPTY as 'FOLDER_NOT_EMPTY',
          'Folder is not empty. Move contents first or use moveContentsToRoot option.',
          400
        );
      }
    }

    await folderRepository.softDelete(folderId, userId);

    // Log operation
    logOperation({
      userId,
      resourceType: 'folder',
      resourceId: folderId,
      resourceName: folder.name,
      action: 'folder.delete',
      description: `Deleted folder: ${folder.name}`,
      metadata: {
        documentCount,
        childFolderCount: childCount,
        movedContentsToRoot: options?.moveContentsToRoot ?? false,
      },
      ipAddress: ctx?.ipAddress ?? null,
      userAgent: ctx?.userAgent ?? null,
      durationMs: Date.now() - startTime,
    });
  },
};
