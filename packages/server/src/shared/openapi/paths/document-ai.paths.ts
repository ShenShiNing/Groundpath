import { z } from '@knowledge-agent/shared/schemas';
import { registry, successResponse, errorResponse, PROTECTED } from '../registry';
import {
  summaryRequestSchema,
  analysisRequestSchema,
  generateRequestSchema,
  expandRequestSchema,
} from '@knowledge-agent/shared/schemas';

const idParam = z.object({ id: z.string() });

// POST /api/document-ai/{id}/summary
registry.registerPath({
  method: 'post',
  path: '/api/document-ai/{id}/summary',
  tags: ['Document AI'],
  summary: '生成文档摘要',
  security: PROTECTED,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: summaryRequestSchema } } },
  },
  responses: {
    200: successResponse(z.object({ summary: z.string() }), '摘要生成成功'),
    404: errorResponse,
  },
});

// POST /api/document-ai/{id}/summary/stream
registry.registerPath({
  method: 'post',
  path: '/api/document-ai/{id}/summary/stream',
  tags: ['Document AI'],
  summary: '流式生成文档摘要 (SSE)',
  security: PROTECTED,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: summaryRequestSchema } } },
  },
  responses: { 200: { description: 'SSE 事件流' }, 404: errorResponse },
});

// POST /api/document-ai/{id}/analyze
registry.registerPath({
  method: 'post',
  path: '/api/document-ai/{id}/analyze',
  tags: ['Document AI'],
  summary: '综合分析文档',
  security: PROTECTED,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: analysisRequestSchema } } },
  },
  responses: {
    200: successResponse(
      z.object({
        keywords: z.array(z.string()).optional(),
        entities: z.array(z.unknown()).optional(),
      }),
      '分析结果'
    ),
    404: errorResponse,
  },
});

// POST /api/document-ai/{id}/analyze/keywords
registry.registerPath({
  method: 'post',
  path: '/api/document-ai/{id}/analyze/keywords',
  tags: ['Document AI'],
  summary: '提取关键词',
  security: PROTECTED,
  request: { params: idParam },
  responses: {
    200: successResponse(z.object({ keywords: z.array(z.string()) }), '关键词列表'),
    404: errorResponse,
  },
});

// POST /api/document-ai/{id}/analyze/entities
registry.registerPath({
  method: 'post',
  path: '/api/document-ai/{id}/analyze/entities',
  tags: ['Document AI'],
  summary: '提取实体',
  security: PROTECTED,
  request: { params: idParam },
  responses: {
    200: successResponse(z.object({ entities: z.array(z.unknown()) }), '实体列表'),
    404: errorResponse,
  },
});

// GET /api/document-ai/{id}/analyze/structure
registry.registerPath({
  method: 'get',
  path: '/api/document-ai/{id}/analyze/structure',
  tags: ['Document AI'],
  summary: '获取文档结构',
  security: PROTECTED,
  request: { params: idParam },
  responses: {
    200: successResponse(z.object({ structure: z.unknown() }), '文档结构'),
    404: errorResponse,
  },
});

// POST /api/document-ai/generate
registry.registerPath({
  method: 'post',
  path: '/api/document-ai/generate',
  tags: ['Document AI'],
  summary: '生成新内容',
  security: PROTECTED,
  request: { body: { content: { 'application/json': { schema: generateRequestSchema } } } },
  responses: {
    200: successResponse(z.object({ content: z.string() }), '生成内容'),
    400: errorResponse,
  },
});

// POST /api/document-ai/generate/stream
registry.registerPath({
  method: 'post',
  path: '/api/document-ai/generate/stream',
  tags: ['Document AI'],
  summary: '流式生成内容 (SSE)',
  security: PROTECTED,
  request: { body: { content: { 'application/json': { schema: generateRequestSchema } } } },
  responses: { 200: { description: 'SSE 事件流' }, 400: errorResponse },
});

// POST /api/document-ai/{id}/expand
registry.registerPath({
  method: 'post',
  path: '/api/document-ai/{id}/expand',
  tags: ['Document AI'],
  summary: '扩展文档内容',
  security: PROTECTED,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: expandRequestSchema } } },
  },
  responses: {
    200: successResponse(z.object({ content: z.string() }), '扩展内容'),
    404: errorResponse,
  },
});

// POST /api/document-ai/{id}/expand/stream
registry.registerPath({
  method: 'post',
  path: '/api/document-ai/{id}/expand/stream',
  tags: ['Document AI'],
  summary: '流式扩展文档 (SSE)',
  security: PROTECTED,
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: expandRequestSchema } } },
  },
  responses: { 200: { description: 'SSE 事件流' }, 404: errorResponse },
});
