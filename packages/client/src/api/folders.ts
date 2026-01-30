import type {
  FolderInfo,
  FolderWithCounts,
  FolderTreeNode,
  CreateFolderRequest,
  UpdateFolderRequest,
} from '@knowledge-agent/shared/types';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { apiClient, unwrapResponse } from './client';

export const foldersApi = {
  /**
   * Create a new folder
   */
  async create(data: CreateFolderRequest): Promise<FolderInfo> {
    const response = await apiClient.post<ApiResponse<FolderInfo>>('/api/folders', data);
    return unwrapResponse(response.data);
  },

  /**
   * List all folders (flat list)
   */
  async list(): Promise<FolderInfo[]> {
    const response = await apiClient.get<ApiResponse<FolderInfo[]>>('/api/folders');
    return unwrapResponse(response.data);
  },

  /**
   * Get folder tree
   */
  async getTree(): Promise<FolderTreeNode[]> {
    const response = await apiClient.get<ApiResponse<FolderTreeNode[]>>('/api/folders', {
      params: { format: 'tree' },
    });
    return unwrapResponse(response.data);
  },

  /**
   * Get folder details
   */
  async getById(folderId: string): Promise<FolderWithCounts> {
    const response = await apiClient.get<ApiResponse<FolderWithCounts>>(`/api/folders/${folderId}`);
    return unwrapResponse(response.data);
  },

  /**
   * Get child folders
   */
  async getChildren(parentId: string | null): Promise<FolderInfo[]> {
    const id = parentId ?? 'root';
    const response = await apiClient.get<ApiResponse<FolderInfo[]>>(`/api/folders/${id}/children`);
    return unwrapResponse(response.data);
  },

  /**
   * Update folder
   */
  async update(folderId: string, data: UpdateFolderRequest): Promise<FolderInfo> {
    const response = await apiClient.patch<ApiResponse<FolderInfo>>(
      `/api/folders/${folderId}`,
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * Delete folder
   */
  async delete(folderId: string, moveContentsToRoot = false): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/api/folders/${folderId}`,
      { params: { moveContentsToRoot: moveContentsToRoot.toString() } }
    );
    unwrapResponse(response.data);
  },
};
