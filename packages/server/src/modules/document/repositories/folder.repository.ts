import { eq, and, isNull, count } from 'drizzle-orm';
import { db } from '@shared/db';
import { now } from '@shared/db/db.utils';
import { folders, type Folder, type NewFolder } from '@shared/db/schema/document/folders.schema';
import { documents } from '@shared/db/schema/document/documents.schema';

/**
 * Folder repository for database operations
 */
export const folderRepository = {
  /**
   * Create a new folder
   */
  async create(data: NewFolder): Promise<Folder> {
    await db.insert(folders).values(data);
    const result = await db.select().from(folders).where(eq(folders.id, data.id)).limit(1);
    return result[0]!;
  },

  /**
   * Find folder by ID (non-deleted only)
   */
  async findById(id: string): Promise<Folder | undefined> {
    const result = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
      .limit(1);
    return result[0];
  },

  /**
   * Find folder by ID and user (for ownership check)
   */
  async findByIdAndUser(id: string, userId: string): Promise<Folder | undefined> {
    const result = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, userId), isNull(folders.deletedAt)))
      .limit(1);
    return result[0];
  },

  /**
   * List all folders for a user
   */
  async listByUser(userId: string): Promise<Folder[]> {
    return db
      .select()
      .from(folders)
      .where(and(eq(folders.userId, userId), isNull(folders.deletedAt)))
      .orderBy(folders.name);
  },

  /**
   * List all folders in a knowledge base
   */
  async listByKnowledgeBase(knowledgeBaseId: string, userId: string): Promise<Folder[]> {
    return db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.knowledgeBaseId, knowledgeBaseId),
          eq(folders.userId, userId),
          isNull(folders.deletedAt)
        )
      )
      .orderBy(folders.name);
  },

  /**
   * List child folders of a parent
   */
  async listByParent(userId: string, parentId: string | null): Promise<Folder[]> {
    const conditions = [eq(folders.userId, userId), isNull(folders.deletedAt)];

    if (parentId === null) {
      conditions.push(isNull(folders.parentId));
    } else {
      conditions.push(eq(folders.parentId, parentId));
    }

    return db
      .select()
      .from(folders)
      .where(and(...conditions))
      .orderBy(folders.name);
  },

  /**
   * Update folder
   */
  async update(
    id: string,
    data: Partial<Pick<Folder, 'name' | 'parentId' | 'path' | 'updatedBy'>>
  ): Promise<Folder | undefined> {
    await db.update(folders).set(data).where(eq(folders.id, id));
    return this.findById(id);
  },

  /**
   * Soft delete folder
   */
  async softDelete(id: string, deletedBy: string): Promise<void> {
    await db
      .update(folders)
      .set({
        deletedAt: now(),
        deletedBy,
      })
      .where(eq(folders.id, id));
  },

  /**
   * Count child folders
   */
  async countChildren(parentId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(folders)
      .where(and(eq(folders.parentId, parentId), isNull(folders.deletedAt)));
    return result[0]?.count ?? 0;
  },

  /**
   * Count documents in folder
   */
  async countDocuments(folderId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(documents)
      .where(and(eq(documents.folderId, folderId), isNull(documents.deletedAt)));
    return result[0]?.count ?? 0;
  },

  /**
   * Get folder with counts (documents and child folders)
   */
  async getWithCounts(
    folder: Folder
  ): Promise<Folder & { documentCount: number; childFolderCount: number }> {
    const [documentCount, childFolderCount] = await Promise.all([
      this.countDocuments(folder.id),
      this.countChildren(folder.id),
    ]);

    return {
      ...folder,
      documentCount,
      childFolderCount,
    };
  },

  /**
   * Check if folder is ancestor of another folder (to prevent circular references)
   */
  async isAncestorOf(potentialAncestorId: string, folderId: string): Promise<boolean> {
    let currentFolder = await this.findById(folderId);

    while (currentFolder?.parentId) {
      if (currentFolder.parentId === potentialAncestorId) {
        return true;
      }
      currentFolder = await this.findById(currentFolder.parentId);
    }

    return false;
  },

  /**
   * Get all descendant folder IDs (for cascading operations)
   */
  async getAllDescendantIds(folderId: string, userId: string): Promise<string[]> {
    const descendants: string[] = [];
    const toProcess = [folderId];

    while (toProcess.length > 0) {
      const currentId = toProcess.pop()!;
      const children = await this.listByParent(userId, currentId);

      for (const child of children) {
        descendants.push(child.id);
        toProcess.push(child.id);
      }
    }

    return descendants;
  },

  /**
   * Build path for a folder based on its parent
   */
  async buildPath(parentId: string | null): Promise<string> {
    if (!parentId) {
      return '/';
    }

    const parent = await this.findById(parentId);
    if (!parent) {
      return '/';
    }

    return `${parent.path}${parentId}/`;
  },

  /**
   * Update paths for all descendants (when a folder is moved)
   */
  async updateDescendantPaths(folderId: string, userId: string): Promise<void> {
    const folder = await this.findById(folderId);
    if (!folder) return;

    const children = await this.listByParent(userId, folderId);
    for (const child of children) {
      const newPath = `${folder.path}${folderId}/`;
      await db.update(folders).set({ path: newPath }).where(eq(folders.id, child.id));

      // Recursively update descendants
      await this.updateDescendantPaths(child.id, userId);
    }
  },
};
