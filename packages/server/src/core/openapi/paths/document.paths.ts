import { z } from '@groundpath/shared/schemas';
import {
  updateDocumentRequestSchema,
  saveDocumentContentSchema,
  documentListParamsSchema,
  trashListParamsSchema,
} from '@groundpath/shared/schemas';
import { errorResponse, messageResponse, paginatedResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

const documentItem = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  documentType: z.string(),
  fileSize: z.number(),
  knowledgeBaseId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const documentOpenApiOperations = defineOpenApiOperations({
  'GET /api/documents/trash': {
    summary: '列出垃圾桶文档',
    request: { query: trashListParamsSchema },
    responses: { 200: paginatedResponse(documentItem, '垃圾桶文档列表') },
  },
  'DELETE /api/documents/trash': {
    summary: '清空垃圾桶',
    responses: { 200: messageResponse('垃圾桶已清空') },
  },
  'POST /api/documents/{id}/restore': {
    summary: '从垃圾桶恢复文档',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: messageResponse('文档已恢复'), 404: errorResponse },
  },
  'DELETE /api/documents/{id}/permanent': {
    summary: '永久删除文档',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: messageResponse('文档已永久删除'), 404: errorResponse },
  },
  'POST /api/documents': {
    summary: '上传文档',
    request: {
      body: {
        content: {
          'multipart/form-data': {
            schema: z.object({
              file: z.string().openapi({ format: 'binary' }),
              knowledgeBaseId: z.string().uuid().optional(),
            }),
          },
        },
      },
    },
    responses: { 201: successResponse(documentItem, '文档上传成功'), 400: errorResponse },
  },
  'GET /api/documents': {
    summary: '列出文档',
    request: { query: documentListParamsSchema },
    responses: { 200: paginatedResponse(documentItem, '文档列表') },
  },
  'GET /api/documents/{id}': {
    summary: '获取文档详情',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: successResponse(documentItem, '文档详情'), 404: errorResponse },
  },
  'PATCH /api/documents/{id}': {
    summary: '更新文档信息',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: updateDocumentRequestSchema } } },
    },
    responses: { 200: successResponse(documentItem, '文档更新成功'), 404: errorResponse },
  },
  'DELETE /api/documents/{id}': {
    summary: '删除文档（移入垃圾桶）',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: messageResponse('文档已移入垃圾桶'), 404: errorResponse },
  },
  'GET /api/documents/{id}/content': {
    summary: '获取文档内容',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: successResponse(z.object({ content: z.string() }), '文档内容'),
      404: errorResponse,
    },
  },
  'PUT /api/documents/{id}/content': {
    summary: '保存文档内容',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: saveDocumentContentSchema } } },
    },
    responses: { 200: messageResponse('文档内容已保存'), 404: errorResponse },
  },
  'GET /api/documents/{id}/download': {
    summary: '下载文档',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: '文件流' }, 404: errorResponse },
  },
  'GET /api/documents/{id}/preview': {
    summary: '预览文档',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: '预览内容' }, 404: errorResponse },
  },
  'GET /api/documents/{id}/versions': {
    summary: '获取文档版本历史',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: successResponse(
        z.array(
          z.object({
            id: z.string(),
            versionNumber: z.number(),
            changeNote: z.string().nullable(),
            createdAt: z.string(),
          })
        ),
        '版本历史'
      ),
      404: errorResponse,
    },
  },
  'POST /api/documents/{id}/versions': {
    summary: '上传新版本',
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
    responses: { 201: messageResponse('新版本上传成功'), 404: errorResponse },
  },
  'POST /api/documents/{id}/versions/{versionId}/restore': {
    summary: '恢复到指定版本',
    request: { params: z.object({ id: z.string(), versionId: z.string() }) },
    responses: { 200: messageResponse('版本已恢复'), 404: errorResponse },
  },
});
