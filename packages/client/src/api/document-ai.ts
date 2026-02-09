/**
 * Document AI API
 * Client for document summarization, analysis, and generation features
 */

import type {
  ApiResponse,
  SummaryRequest,
  SummaryResponse,
  AnalysisRequest,
  AnalysisResponse,
  KeywordsResponse,
  EntitiesResponse,
  StructureResponse,
  GenerationRequest,
  GenerationResponse,
  ExpandRequest,
  ExpandResponse,
  DocumentAISSEEvent,
} from '@knowledge-agent/shared/types';
import { apiClient, unwrapResponse, fetchStreamWithAuth } from '@/lib/http';
import { parseSSEStream, createSSEDispatcher } from '@/lib/sse';

// ============================================================================
// Summary API
// ============================================================================

export const summaryApi = {
  /**
   * Generate document summary (non-streaming)
   */
  async generate(documentId: string, data?: SummaryRequest): Promise<SummaryResponse> {
    const response = await apiClient.post<ApiResponse<SummaryResponse>>(
      `/api/document-ai/${documentId}/summary`,
      data ?? {}
    );
    return unwrapResponse(response.data);
  },
};

// ============================================================================
// Analysis API
// ============================================================================

export const analysisApi = {
  /**
   * Perform comprehensive document analysis
   */
  async analyze(documentId: string, data?: AnalysisRequest): Promise<AnalysisResponse> {
    const response = await apiClient.post<ApiResponse<AnalysisResponse>>(
      `/api/document-ai/${documentId}/analyze`,
      data ?? {}
    );
    return unwrapResponse(response.data);
  },

  /**
   * Extract keywords from document
   */
  async extractKeywords(
    documentId: string,
    options?: { maxKeywords?: number }
  ): Promise<KeywordsResponse> {
    const response = await apiClient.post<ApiResponse<KeywordsResponse>>(
      `/api/document-ai/${documentId}/analyze/keywords`,
      options ?? {}
    );
    return unwrapResponse(response.data);
  },

  /**
   * Extract entities from document
   */
  async extractEntities(
    documentId: string,
    options?: { maxEntities?: number }
  ): Promise<EntitiesResponse> {
    const response = await apiClient.post<ApiResponse<EntitiesResponse>>(
      `/api/document-ai/${documentId}/analyze/entities`,
      options ?? {}
    );
    return unwrapResponse(response.data);
  },

  /**
   * Get document structure analysis (no LLM required)
   */
  async getStructure(documentId: string): Promise<StructureResponse> {
    const response = await apiClient.get<ApiResponse<StructureResponse>>(
      `/api/document-ai/${documentId}/analyze/structure`
    );
    return unwrapResponse(response.data);
  },
};

// ============================================================================
// Generation API
// ============================================================================

export const generationApi = {
  /**
   * Generate new content (non-streaming)
   */
  async generate(data: GenerationRequest): Promise<GenerationResponse> {
    const response = await apiClient.post<ApiResponse<GenerationResponse>>(
      '/api/document-ai/generate',
      data
    );
    return unwrapResponse(response.data);
  },

  /**
   * Expand existing document (non-streaming)
   */
  async expand(documentId: string, data: ExpandRequest): Promise<ExpandResponse> {
    const response = await apiClient.post<ApiResponse<ExpandResponse>>(
      `/api/document-ai/${documentId}/expand`,
      data
    );
    return unwrapResponse(response.data);
  },
};

// ============================================================================
// SSE Streaming Types
// ============================================================================

export interface DocumentAISSEHandlers {
  onChunk: (text: string) => void;
  onDone: (data: { wordCount: number; generatedAt: string }) => void;
  onError: (error: { code: string; message: string }) => void;
}

// ============================================================================
// SSE Streaming Functions
// ============================================================================

/**
 * Stream document summary generation via SSE
 * Returns an AbortController to cancel the stream
 */
export function streamSummary(
  documentId: string,
  data: SummaryRequest | undefined,
  handlers: DocumentAISSEHandlers,
  getAccessToken: () => string | null
): AbortController {
  const abortController = new AbortController();

  const run = async () => {
    const result = await fetchStreamWithAuth(
      `/api/document-ai/${documentId}/summary/stream`,
      { method: 'POST', body: JSON.stringify(data ?? {}) },
      { getAccessToken, signal: abortController.signal }
    );

    if (!result.ok) {
      if (result.error.code !== 'ABORTED') {
        handlers.onError(result.error);
      }
      return;
    }

    const dispatcher = createSSEDispatcher<DocumentAISSEEvent>(
      {
        chunk: (chunk) => handlers.onChunk(chunk as string),
        done: (done) => handlers.onDone(done as { wordCount: number; generatedAt: string }),
        error: (err) => handlers.onError(err as { code: string; message: string }),
      },
      handlers.onError
    );

    await parseSSEStream(result.reader, dispatcher);
  };

  run();
  return abortController;
}

/**
 * Stream content generation via SSE
 * Returns an AbortController to cancel the stream
 */
export function streamGenerate(
  data: GenerationRequest,
  handlers: DocumentAISSEHandlers,
  getAccessToken: () => string | null
): AbortController {
  const abortController = new AbortController();

  const run = async () => {
    const result = await fetchStreamWithAuth(
      '/api/document-ai/generate/stream',
      { method: 'POST', body: JSON.stringify(data) },
      { getAccessToken, signal: abortController.signal }
    );

    if (!result.ok) {
      if (result.error.code !== 'ABORTED') {
        handlers.onError(result.error);
      }
      return;
    }

    const dispatcher = createSSEDispatcher<DocumentAISSEEvent>(
      {
        chunk: (chunk) => handlers.onChunk(chunk as string),
        done: (done) => handlers.onDone(done as { wordCount: number; generatedAt: string }),
        error: (err) => handlers.onError(err as { code: string; message: string }),
      },
      handlers.onError
    );

    await parseSSEStream(result.reader, dispatcher);
  };

  run();
  return abortController;
}

/**
 * Stream document expansion via SSE
 * Returns an AbortController to cancel the stream
 */
export function streamExpand(
  documentId: string,
  data: ExpandRequest,
  handlers: DocumentAISSEHandlers,
  getAccessToken: () => string | null
): AbortController {
  const abortController = new AbortController();

  const run = async () => {
    const result = await fetchStreamWithAuth(
      `/api/document-ai/${documentId}/expand/stream`,
      { method: 'POST', body: JSON.stringify(data) },
      { getAccessToken, signal: abortController.signal }
    );

    if (!result.ok) {
      if (result.error.code !== 'ABORTED') {
        handlers.onError(result.error);
      }
      return;
    }

    const dispatcher = createSSEDispatcher<DocumentAISSEEvent>(
      {
        chunk: (chunk) => handlers.onChunk(chunk as string),
        done: (done) => handlers.onDone(done as { wordCount: number; generatedAt: string }),
        error: (err) => handlers.onError(err as { code: string; message: string }),
      },
      handlers.onError
    );

    await parseSSEStream(result.reader, dispatcher);
  };

  run();
  return abortController;
}

// ============================================================================
// Combined Export
// ============================================================================

export const documentAiApi = {
  summary: summaryApi,
  analysis: analysisApi,
  generation: generationApi,
  streamSummary,
  streamGenerate,
  streamExpand,
};
