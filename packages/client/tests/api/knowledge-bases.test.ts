import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  unwrapResponse: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
  },
  unwrapResponse: mocks.unwrapResponse,
}));

import { knowledgeBasesApi } from '@/api/knowledge-bases';

describe('knowledgeBasesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should unwrap paginated knowledge base list and return items only', async () => {
    const responsePayload = {
      knowledgeBases: [
        { id: 'kb-1', name: 'KB 1' },
        { id: 'kb-2', name: 'KB 2' },
      ],
      pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    };
    mocks.get.mockResolvedValue({ data: { success: true, data: responsePayload } });
    mocks.unwrapResponse.mockReturnValue(responsePayload);

    const result = await knowledgeBasesApi.list();

    expect(mocks.get).toHaveBeenCalledWith('/api/knowledge-bases');
    expect(result).toEqual(responsePayload.knowledgeBases);
  });

  it('should list knowledge base documents with query params', async () => {
    const responsePayload = {
      documents: [{ id: 'doc-1', title: 'Doc 1' }],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    };
    mocks.get.mockResolvedValue({ data: { success: true, data: responsePayload } });
    mocks.unwrapResponse.mockReturnValue(responsePayload);

    const result = await knowledgeBasesApi.listDocuments('kb-1', { pageSize: 50, search: 'doc' });

    expect(mocks.get).toHaveBeenCalledWith('/api/knowledge-bases/kb-1/documents', {
      params: { pageSize: 50, search: 'doc' },
    });
    expect(result).toEqual(responsePayload);
  });

  it('should upload document with multipart headers, signal, and progress callback', async () => {
    const formData = new FormData();
    const signal = new AbortController().signal;
    const onUploadProgress = vi.fn();
    const responsePayload = {
      document: { id: 'doc-1', title: 'Uploaded' },
      message: 'ok',
    };
    mocks.post.mockResolvedValue({ data: { success: true, data: responsePayload } });
    mocks.unwrapResponse.mockReturnValue(responsePayload);

    const result = await knowledgeBasesApi.uploadDocument('kb-1', formData, {
      signal,
      onUploadProgress,
    });

    expect(mocks.post).toHaveBeenCalledWith(
      '/api/knowledge-bases/kb-1/documents',
      formData,
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
        signal,
        onUploadProgress: expect.any(Function),
      })
    );

    const config = mocks.post.mock.calls[0]?.[2] as {
      onUploadProgress?: (event: { loaded: number; total?: number }) => void;
    };
    config.onUploadProgress?.({ loaded: 25, total: 100 });
    expect(onUploadProgress).toHaveBeenCalledWith(25, 100);
    expect(result).toEqual(responsePayload);
  });
});
