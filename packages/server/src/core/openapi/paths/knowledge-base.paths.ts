import { z } from '@knowledge-agent/shared/schemas';
import {
  createKnowledgeBaseSchema,
  updateKnowledgeBaseSchema,
  knowledgeBaseListParamsSchema,
} from '@knowledge-agent/shared/schemas';
import { errorResponse, messageResponse, paginatedResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

const kbItem = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  embeddingProvider: z.string(),
  documentCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const knowledgeBaseOpenApiOperations = defineOpenApiOperations({
  'POST /api/knowledge-bases': {
    summary: '创建知识库',
    request: { body: { content: { 'application/json': { schema: createKnowledgeBaseSchema } } } },
    responses: { 201: successResponse(kbItem, '知识库创建成功'), 400: errorResponse },
  },
  'GET /api/knowledge-bases': {
    summary: '列出知识库',
    request: { query: knowledgeBaseListParamsSchema },
    responses: { 200: paginatedResponse(kbItem, '知识库列表') },
  },
  'GET /api/knowledge-bases/{id}': {
    summary: '获取知识库详情',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: successResponse(kbItem, '知识库详情'), 404: errorResponse },
  },
  'PATCH /api/knowledge-bases/{id}': {
    summary: '更新知识库',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: updateKnowledgeBaseSchema } } },
    },
    responses: { 200: successResponse(kbItem, '知识库更新成功'), 404: errorResponse },
  },
  'DELETE /api/knowledge-bases/{id}': {
    summary: '删除知识库',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: messageResponse('知识库已删除'), 404: errorResponse },
  },
  'POST /api/knowledge-bases/{id}/documents': {
    summary: '上传文档到知识库',
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          'multipart/form-data': {
            schema: z.object({ file: z.string().openapi({ format: 'binary' }) }),
          },
        },
      },
    },
    responses: {
      201: successResponse(z.object({ id: z.string(), title: z.string() }), '文档上传成功'),
      400: errorResponse,
    },
  },
  'GET /api/knowledge-bases/{id}/documents': {
    summary: '列出知识库内文档',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: paginatedResponse(
        z.object({ id: z.string(), title: z.string(), documentType: z.string() }),
        '文档列表'
      ),
    },
  },
});
