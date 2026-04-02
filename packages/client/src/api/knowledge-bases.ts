import type {
  KnowledgeBaseInfo,
  KnowledgeBaseListItem,
  KnowledgeBaseListResponse,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  DocumentListResponse,
  DocumentListParams,
  DocumentInfo,
  KnowledgeBaseListParams,
} from '@groundpath/shared/types';
import type { ApiResponse } from '@groundpath/shared/types';
import { KNOWLEDGE_BASE_LIST_PAGE_SIZE } from '@/constants/pagination';
import { apiClient, unwrapResponse } from '@/lib/http';
import type { UploadOptions } from './documents';
import { collectCursorPages } from './cursor-pagination';

export const knowledgeBasesApi = {
  /**
   * Create a new knowledge base
   */
  async create(data: CreateKnowledgeBaseRequest): Promise<KnowledgeBaseInfo> {
    const response = await apiClient.post<ApiResponse<KnowledgeBaseInfo>>(
      '/api/v1/knowledge-bases',
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * List all knowledge bases
   */
  async listPage(params?: Partial<KnowledgeBaseListParams>): Promise<KnowledgeBaseListResponse> {
    const response = await apiClient.get<ApiResponse<KnowledgeBaseListResponse>>(
      '/api/v1/knowledge-bases',
      { params }
    );
    return unwrapResponse(response.data);
  },

  async list(): Promise<KnowledgeBaseListItem[]> {
    const response = await collectCursorPages({
      fetchPage: (cursor) =>
        knowledgeBasesApi.listPage({ pageSize: KNOWLEDGE_BASE_LIST_PAGE_SIZE, cursor }),
      mergePages: (pages) => {
        const firstPage = pages[0]!;
        return {
          knowledgeBases: pages.flatMap((page) => page.knowledgeBases),
          pagination: {
            ...firstPage.pagination,
            hasMore: false,
            nextCursor: null,
          },
        };
      },
    });
    return response.knowledgeBases;
  },

  /**
   * Get knowledge base details
   */
  async getById(id: string): Promise<KnowledgeBaseInfo> {
    const response = await apiClient.get<ApiResponse<KnowledgeBaseInfo>>(
      `/api/v1/knowledge-bases/${id}`
    );
    return unwrapResponse(response.data);
  },

  /**
   * Update knowledge base
   */
  async update(id: string, data: UpdateKnowledgeBaseRequest): Promise<KnowledgeBaseInfo> {
    const response = await apiClient.patch<ApiResponse<KnowledgeBaseInfo>>(
      `/api/v1/knowledge-bases/${id}`,
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * Delete knowledge base
   */
  async delete(id: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/api/v1/knowledge-bases/${id}`
    );
    unwrapResponse(response.data);
  },

  /**
   * List documents in a knowledge base
   */
  async listDocumentsPage(
    kbId: string,
    params?: Partial<DocumentListParams>
  ): Promise<DocumentListResponse> {
    const response = await apiClient.get<ApiResponse<DocumentListResponse>>(
      `/api/v1/knowledge-bases/${kbId}/documents`,
      { params }
    );
    return unwrapResponse(response.data);
  },

  async listDocuments(
    kbId: string,
    params?: Partial<DocumentListParams>
  ): Promise<DocumentListResponse> {
    return collectCursorPages({
      fetchPage: (cursor) => knowledgeBasesApi.listDocumentsPage(kbId, { ...params, cursor }),
      mergePages: (pages) => {
        const firstPage = pages[0]!;
        return {
          documents: pages.flatMap((page) => page.documents),
          pagination: {
            ...firstPage.pagination,
            hasMore: false,
            nextCursor: null,
          },
        };
      },
    });
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
      `/api/v1/knowledge-bases/${kbId}/documents`,
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
};
