import {
  z,
  summaryRequestSchema,
  analysisRequestSchema,
  extractKeywordsRequestSchema,
  extractEntitiesRequestSchema,
  generateRequestSchema,
  expandRequestSchema,
  summaryResponseSchema,
  analysisResponseSchema,
  keywordsResponseSchema,
  entitiesResponseSchema,
  structureResponseSchema,
  generationResponseSchema,
  expandResponseSchema,
} from '@groundpath/shared/schemas';
import { errorResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

const idParam = z.object({ id: z.string() });

export const documentAiOpenApiOperations = defineOpenApiOperations({
  'POST /api/document-ai/{id}/summary': {
    summary: '生成文档摘要',
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: summaryRequestSchema } } },
    },
    responses: {
      200: successResponse(summaryResponseSchema, '摘要生成成功'),
      404: errorResponse,
    },
  },
  'POST /api/document-ai/{id}/summary/stream': {
    summary: '流式生成文档摘要 (SSE)',
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: summaryRequestSchema } } },
    },
    responses: { 200: { description: 'SSE 事件流' }, 404: errorResponse },
  },
  'POST /api/document-ai/{id}/analyze': {
    summary: '综合分析文档',
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: analysisRequestSchema } } },
    },
    responses: { 200: successResponse(analysisResponseSchema, '分析结果'), 404: errorResponse },
  },
  'POST /api/document-ai/{id}/analyze/keywords': {
    summary: '提取关键词',
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: extractKeywordsRequestSchema } } },
    },
    responses: {
      200: successResponse(keywordsResponseSchema, '关键词列表'),
      404: errorResponse,
    },
  },
  'POST /api/document-ai/{id}/analyze/entities': {
    summary: '提取实体',
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: extractEntitiesRequestSchema } } },
    },
    responses: {
      200: successResponse(entitiesResponseSchema, '实体列表'),
      404: errorResponse,
    },
  },
  'GET /api/document-ai/{id}/analyze/structure': {
    summary: '获取文档结构',
    request: { params: idParam },
    responses: {
      200: successResponse(structureResponseSchema, '文档结构'),
      404: errorResponse,
    },
  },
  'POST /api/document-ai/generate': {
    summary: '生成新内容',
    request: { body: { content: { 'application/json': { schema: generateRequestSchema } } } },
    responses: {
      200: successResponse(generationResponseSchema, '生成内容'),
      400: errorResponse,
    },
  },
  'POST /api/document-ai/generate/stream': {
    summary: '流式生成内容 (SSE)',
    request: { body: { content: { 'application/json': { schema: generateRequestSchema } } } },
    responses: { 200: { description: 'SSE 事件流' }, 400: errorResponse },
  },
  'POST /api/document-ai/{id}/expand': {
    summary: '扩展文档内容',
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: expandRequestSchema } } },
    },
    responses: {
      200: successResponse(expandResponseSchema, '扩展内容'),
      404: errorResponse,
    },
  },
  'POST /api/document-ai/{id}/expand/stream': {
    summary: '流式扩展文档 (SSE)',
    request: {
      params: idParam,
      body: { content: { 'application/json': { schema: expandRequestSchema } } },
    },
    responses: { 200: { description: 'SSE 事件流' }, 404: errorResponse },
  },
});
