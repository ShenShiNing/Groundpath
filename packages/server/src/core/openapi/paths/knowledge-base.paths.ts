import { z } from '@groundpath/shared/schemas';
import {
  createKnowledgeBaseSchema,
  documentListResponseSchema,
  documentMutationResponseSchema,
  knowledgeBaseDocumentListParamsSchema,
  knowledgeBaseDocumentUploadMetadataSchema,
  knowledgeBaseInfoResponseSchema,
  knowledgeBaseListResponseSchema,
  knowledgeBaseListParamsSchema,
  updateKnowledgeBaseSchema,
} from '@groundpath/shared/schemas';
import { errorResponse, messageResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

export const knowledgeBaseOpenApiOperations = defineOpenApiOperations({
  'POST /api/v1/knowledge-bases': {
    summary: '创建知识库',
    request: { body: { content: { 'application/json': { schema: createKnowledgeBaseSchema } } } },
    responses: {
      201: successResponse(knowledgeBaseInfoResponseSchema, '知识库创建成功'),
      400: errorResponse,
    },
  },
  'GET /api/v1/knowledge-bases': {
    summary: '列出知识库',
    request: { query: knowledgeBaseListParamsSchema },
    responses: { 200: successResponse(knowledgeBaseListResponseSchema, '知识库列表') },
  },
  'GET /api/v1/knowledge-bases/{id}': {
    summary: '获取知识库详情',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: successResponse(knowledgeBaseInfoResponseSchema, '知识库详情'),
      404: errorResponse,
    },
  },
  'PATCH /api/v1/knowledge-bases/{id}': {
    summary: '更新知识库',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: updateKnowledgeBaseSchema } } },
    },
    responses: {
      200: successResponse(knowledgeBaseInfoResponseSchema, '知识库更新成功'),
      404: errorResponse,
    },
  },
  'DELETE /api/v1/knowledge-bases/{id}': {
    summary: '删除知识库',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: messageResponse('知识库已删除'), 404: errorResponse },
  },
  'POST /api/v1/knowledge-bases/{id}/documents': {
    summary: '上传文档到知识库',
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          'multipart/form-data': {
            schema: knowledgeBaseDocumentUploadMetadataSchema.extend({
              file: z.string().openapi({ format: 'binary' }),
            }),
          },
        },
      },
    },
    responses: {
      201: successResponse(documentMutationResponseSchema, '文档上传成功'),
      400: errorResponse,
    },
  },
  'GET /api/v1/knowledge-bases/{id}/documents': {
    summary: '列出知识库内文档',
    request: {
      params: z.object({ id: z.string() }),
      query: knowledgeBaseDocumentListParamsSchema,
    },
    responses: {
      200: successResponse(documentListResponseSchema, '文档列表'),
    },
  },
});
