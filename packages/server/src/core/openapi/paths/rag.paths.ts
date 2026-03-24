import { z } from '@groundpath/shared/schemas';
import { ragSearchRequestSchema } from '@groundpath/shared/schemas';
import { errorResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

export const ragOpenApiOperations = defineOpenApiOperations({
  'POST /api/v1/rag/search': {
    summary: 'RAG 语义搜索',
    request: { body: { content: { 'application/json': { schema: ragSearchRequestSchema } } } },
    responses: {
      200: successResponse(
        z.object({
          results: z.array(
            z.object({
              content: z.string(),
              score: z.number(),
              documentId: z.string(),
              documentTitle: z.string(),
            })
          ),
        }),
        '搜索结果'
      ),
      400: errorResponse,
    },
  },
  'POST /api/v1/rag/process/{documentId}': {
    summary: '处理文档（向量化）',
    request: { params: z.object({ documentId: z.string() }) },
    responses: {
      200: successResponse(
        z.object({ message: z.string(), jobId: z.string().optional() }),
        '处理已启动'
      ),
      404: errorResponse,
    },
  },
  'GET /api/v1/rag/status/{documentId}': {
    summary: '获取文档处理状态',
    request: { params: z.object({ documentId: z.string() }) },
    responses: {
      200: successResponse(
        z.object({
          status: z.string(),
          progress: z.number().optional(),
          error: z.string().optional(),
        }),
        '处理状态'
      ),
      404: errorResponse,
    },
  },
});
