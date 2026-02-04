import type {
  DocumentInfo,
  DocumentListResponse,
  DocumentListParams,
  UpdateDocumentRequest,
  TrashListParams,
  TrashListResponse,
  VersionListResponse,
  DocumentContentResponse,
} from '@knowledge-agent/shared/types';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { apiClient, unwrapResponse } from '@/lib/http';

export interface UploadOptions {
  onUploadProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export const documentsApi = {
  /**
   * Upload a new document
   */
  async upload(
    formData: FormData,
    options?: UploadOptions
  ): Promise<{ document: DocumentInfo; message: string }> {
    const response = await apiClient.post<ApiResponse<{ document: DocumentInfo; message: string }>>(
      '/api/documents',
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
   * List documents with pagination and filtering
   */
  async list(params?: Partial<DocumentListParams>): Promise<DocumentListResponse> {
    const response = await apiClient.get<ApiResponse<DocumentListResponse>>('/api/documents', {
      params,
    });
    return unwrapResponse(response.data);
  },

  /**
   * Get document details
   */
  async getById(documentId: string): Promise<DocumentInfo> {
    const response = await apiClient.get<ApiResponse<DocumentInfo>>(`/api/documents/${documentId}`);
    return unwrapResponse(response.data);
  },

  /**
   * Get document content
   */
  async getContent(documentId: string): Promise<DocumentContentResponse> {
    const response = await apiClient.get<ApiResponse<DocumentContentResponse>>(
      `/api/documents/${documentId}/content`
    );
    return unwrapResponse(response.data);
  },

  /**
   * Update document metadata
   */
  async update(documentId: string, data: UpdateDocumentRequest): Promise<DocumentInfo> {
    const response = await apiClient.patch<ApiResponse<DocumentInfo>>(
      `/api/documents/${documentId}`,
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * Delete document
   */
  async delete(documentId: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/api/documents/${documentId}`
    );
    unwrapResponse(response.data);
  },

  /**
   * Get download URL for document
   */
  getDownloadUrl(documentId: string): string {
    return `/api/documents/${documentId}/download`;
  },

  // ==================== Trash Operations ====================

  /**
   * List trash documents
   */
  async listTrash(params?: Partial<TrashListParams>): Promise<TrashListResponse> {
    const response = await apiClient.get<ApiResponse<TrashListResponse>>('/api/documents/trash', {
      params,
    });
    return unwrapResponse(response.data);
  },

  /**
   * Restore a document from trash
   */
  async restore(documentId: string): Promise<{ document: DocumentInfo; message: string }> {
    const response = await apiClient.post<ApiResponse<{ document: DocumentInfo; message: string }>>(
      `/api/documents/${documentId}/restore`
    );
    return unwrapResponse(response.data);
  },

  /**
   * Permanently delete a document
   */
  async permanentDelete(documentId: string): Promise<void> {
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      `/api/documents/${documentId}/permanent`
    );
    unwrapResponse(response.data);
  },

  // ==================== Version Operations ====================

  /**
   * Get version history for a document
   */
  async getVersionHistory(documentId: string): Promise<VersionListResponse> {
    const response = await apiClient.get<ApiResponse<VersionListResponse>>(
      `/api/documents/${documentId}/versions`
    );
    return unwrapResponse(response.data);
  },

  /**
   * Fetch PDF binary (for preview)
   */
  async getPdf(url: string): Promise<Blob> {
    const response = await apiClient.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      withCredentials: true,
    });
    return new Blob([response.data], { type: 'application/pdf' });
  },

  /**
   * Upload a new version of a document
   */
  async uploadNewVersion(
    documentId: string,
    formData: FormData,
    options?: UploadOptions
  ): Promise<{ document: DocumentInfo; message: string }> {
    const response = await apiClient.post<ApiResponse<{ document: DocumentInfo; message: string }>>(
      `/api/documents/${documentId}/versions`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: options?.onUploadProgress
          ? (e) => options.onUploadProgress!(e.loaded, e.total ?? 0)
          : undefined,
      }
    );
    return unwrapResponse(response.data);
  },

  /**
   * Restore document to a specific version
   */
  async restoreVersion(
    documentId: string,
    versionId: string
  ): Promise<{ document: DocumentInfo; message: string }> {
    const response = await apiClient.post<ApiResponse<{ document: DocumentInfo; message: string }>>(
      `/api/documents/${documentId}/versions/${versionId}/restore`
    );
    return unwrapResponse(response.data);
  },
};
