import { eq, and, isNull, count, like, sql } from 'drizzle-orm';
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
   * Uses the materialized path column to avoid N+1 queries
   */
  async isAncestorOf(potentialAncestorId: string, folderId: string): Promise<boolean> {
    const folder = await this.findById(folderId);
    if (!folder) return false;

    // The path column stores materialized paths like "/grandparentId/parentId/"
    // Check if the potential ancestor ID appears in the path
    return (
      folder.path.includes(`/${potentialAncestorId}/`) || folder.parentId === potentialAncestorId
    );
  },

  /**
   * Get all descendant folder IDs (for cascading operations)
   * Uses path prefix matching instead of BFS traversal to avoid N+1 queries
   */
  async getAllDescendantIds(folderId: string, userId: string): Promise<string[]> {
    const folder = await this.findById(folderId);
    if (!folder) return [];

    // Match all folders whose path contains this folder's ID
    // e.g., path LIKE '%/folderId/%' catches all descendants
    const pathPrefix = `${folder.path}${folderId}/`;
    const descendants = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.userId, userId),
          like(folders.path, `${pathPrefix}%`),
          isNull(folders.deletedAt)
        )
      );

    return descendants.map((d) => d.id);
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
   * Uses batch update with string replacement instead of recursive queries
   */
  async updateDescendantPaths(folderId: string, userId: string): Promise<void> {
    const folder = await this.findById(folderId);
    if (!folder) return;

    // Get all direct children and update their paths
    const newBasePath = `${folder.path}${folderId}/`;

    // Update all folders whose parentId matches this folder
    // This includes direct children - their path should be newBasePath
    const directChildren = await this.listByParent(userId, folderId);
    if (directChildren.length === 0) return;

    // For each child, update its path and all its descendants in a single query
    for (const child of directChildren) {
      const oldChildPath = child.path;
      const newChildPath = newBasePath;

      // Update this child's path
      await db.update(folders).set({ path: newChildPath }).where(eq(folders.id, child.id));

      // Batch update all descendants of this child using path prefix replacement
      // REPLACE(path, oldPrefix, newPrefix) for all folders with matching path prefix
      if (oldChildPath !== newChildPath) {
        await db
          .update(folders)
          .set({
            path: sql`REPLACE(${folders.path}, ${oldChildPath + child.id + '/'}, ${newChildPath + child.id + '/'})`,
          })
          .where(
            and(
              eq(folders.userId, userId),
              like(folders.path, `${oldChildPath}${child.id}/%`),
              isNull(folders.deletedAt)
            )
          );
      }
    }
  },
};
