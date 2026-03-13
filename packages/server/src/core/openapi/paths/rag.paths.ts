import { z } from '@knowledge-agent/shared/schemas';
import { registry, successResponse, errorResponse, PROTECTED } from '../registry';
import { ragSearchRequestSchema } from '@knowledge-agent/shared/schemas';

// POST /api/rag/search
registry.registerPath({
  method: 'post',
  path: '/api/rag/search',
  tags: ['RAG'],
  summary: 'RAG 语义搜索',
  security: PROTECTED,
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
});

// POST /api/rag/process/{documentId}
registry.registerPath({
  method: 'post',
  path: '/api/rag/process/{documentId}',
  tags: ['RAG'],
  summary: '处理文档（向量化）',
  security: PROTECTED,
  request: { params: z.object({ documentId: z.string() }) },
  responses: {
    200: successResponse(
      z.object({ message: z.string(), jobId: z.string().optional() }),
      '处理已启动'
    ),
    404: errorResponse,
  },
});

// GET /api/rag/status/{documentId}
registry.registerPath({
  method: 'get',
  path: '/api/rag/status/{documentId}',
  tags: ['RAG'],
  summary: '获取文档处理状态',
  security: PROTECTED,
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
});
