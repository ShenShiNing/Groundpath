import type {
  KnowledgeBaseInfo,
  KnowledgeBaseListItem,
  KnowledgeBaseListResponse,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  DocumentListResponse,
  DocumentListParams,
  DocumentInfo,
} from '@groundpath/shared/types';
import type { ApiResponse } from '@groundpath/shared/types';
import { apiClient, unwrapResponse } from '@/lib/http';
import type { UploadOptions } from './documents';

export const knowledgeBasesApi = {
  /**
   * Create a new knowledge base
   */
  async create(data: CreateKnowledgeBaseRequest): Promise<KnowledgeBaseInfo> {
    const response = await apiClient.post<ApiResponse<KnowledgeBaseInfo>>(
      '/api/knowledge-bases',
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * List all knowledge bases
   */
  async list(): Promise<KnowledgeBaseListItem[]> {
    const response =
      await apiClient.get<ApiResponse<KnowledgeBaseListResponse>>('/api/knowledge-bases');
    return unwrapResponse(response.data).knowledgeBases;
  },

  /**
   * Get knowledge base details
   */
  async getById(id: string): Promise<KnowledgeBaseInfo> {
    const response = await apiClient.get<ApiResponse<KnowledgeBaseInfo>>(
      `/api/knowledge-bases/${id}`
    );
    return unwrapResponse(response.data);
  },

  /**
   * Update knowledge base
   */
  async update(id: string, data: UpdateKnowledgeBaseRequest): Promise<KnowledgeBaseInfo> {
    const response = await apiClient.patch<ApiResponse<KnowledgeBaseInfo>>(
      `/api/knowledge-bases/${id}`,
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * Delete knowledge base
   */
  async delete(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/api/knowledge-bases/${id}`
    );
    unwrapResponse(response.data);
  },

  /**
   * List documents in a knowledge base
   */
  async listDocuments(
    kbId: string,
    params?: Partial<DocumentListParams>
  ): Promise<DocumentListResponse> {
    const response = await apiClient.get<ApiResponse<DocumentListResponse>>(
      `/api/knowledge-bases/${kbId}/documents`,
      { params }
    );
    return unwrapResponse(response.data);
  },

  /**
   * Upload document to a knowledge base
   */
  async uploadDocument(
    kbId: string,
    formData: FormData,
    options?: UploadOptions
  ): Promise<{ document: DocumentInfo; message: string }> {
    const response = await apiClient.post<ApiResponse<{ document: DocumentInfo; message: string }>>(
      `/api/knowledge-bases/${kbId}/documents`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: options?.signal,
        onUploadProgress: options?.onUploadProgress
          ? (e) => options.onUploadProgress!(e.loaded, e.total ?? 0)
          : undefined,
      }
    );
    return unwrapResponse(response.data);
  },

  /**
   * Search within a knowledge base
   */
  async search(
    kbId: string,
    query: string,
    options?: { limit?: number; scoreThreshold?: number }
  ): Promise<unknown[]> {
    const response = await apiClient.post<ApiResponse<unknown[]>>(
      `/api/knowledge-bases/${kbId}/search`,
      { query, ...options }
    );
    return unwrapResponse(response.data);
  },
};
