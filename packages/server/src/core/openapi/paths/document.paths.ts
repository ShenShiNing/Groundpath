import { z } from '@groundpath/shared/schemas';
import {
  clearTrashResponseSchema,
  documentContentResponseSchema,
  documentInfoResponseSchema,
  documentListParamsSchema,
  documentListResponseSchema,
  documentMutationResponseSchema,
  documentUploadMetadataSchema,
  documentVersionUploadMetadataSchema,
  saveDocumentContentSchema,
  trashListParamsSchema,
  trashListResponseSchema,
  updateDocumentRequestSchema,
  versionListResponseSchema,
} from '@groundpath/shared/schemas';
import { errorResponse, messageResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

export const documentOpenApiOperations = defineOpenApiOperations({
  'GET /api/v1/documents/trash': {
    summary: '列出垃圾桶文档',
    request: { query: trashListParamsSchema },
    responses: { 200: successResponse(trashListResponseSchema, '垃圾桶文档列表') },
  },
  'DELETE /api/v1/documents/trash': {
    summary: '清空垃圾桶',
    responses: { 200: successResponse(clearTrashResponseSchema, '垃圾桶已清空') },
  },
  'POST /api/v1/documents/{id}/restore': {
    summary: '从垃圾桶恢复文档',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: successResponse(documentMutationResponseSchema, '文档已恢复'),
      404: errorResponse,
    },
  },
  'DELETE /api/v1/documents/{id}/permanent': {
    summary: '永久删除文档',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: messageResponse('文档已永久删除'), 404: errorResponse },
  },
  'POST /api/v1/documents': {
    summary: '上传文档',
    request: {
      body: {
        content: {
          'multipart/form-data': {
            schema: documentUploadMetadataSchema.extend({
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
  'GET /api/v1/documents': {
    summary: '列出文档',
    request: { query: documentListParamsSchema },
    responses: { 200: successResponse(documentListResponseSchema, '文档列表') },
  },
  'GET /api/v1/documents/{id}': {
    summary: '获取文档详情',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: successResponse(documentInfoResponseSchema, '文档详情'), 404: errorResponse },
  },
  'PATCH /api/v1/documents/{id}': {
    summary: '更新文档信息',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: updateDocumentRequestSchema } } },
    },
    responses: {
      200: successResponse(documentInfoResponseSchema, '文档更新成功'),
      404: errorResponse,
    },
  },
  'DELETE /api/v1/documents/{id}': {
    summary: '删除文档（移入垃圾桶）',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: messageResponse('文档已移入垃圾桶'), 404: errorResponse },
  },
  'GET /api/v1/documents/{id}/content': {
    summary: '获取文档内容',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: successResponse(documentContentResponseSchema, '文档内容'),
      404: errorResponse,
    },
  },
  'PUT /api/v1/documents/{id}/content': {
    summary: '保存文档内容',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: saveDocumentContentSchema } } },
    },
    responses: {
      200: successResponse(documentMutationResponseSchema, '文档内容已保存'),
      404: errorResponse,
    },
  },
  'GET /api/v1/documents/{id}/download': {
    summary: '下载文档',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: '文件流' }, 404: errorResponse },
  },
  'GET /api/v1/documents/{id}/preview': {
    summary: '预览文档',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: { description: '预览内容' }, 404: errorResponse },
  },
  'GET /api/v1/documents/{id}/versions': {
    summary: '获取文档版本历史',
    request: { params: z.object({ id: z.string() }) },
    responses: { 200: successResponse(versionListResponseSchema, '版本历史'), 404: errorResponse },
  },
  'POST /api/v1/documents/{id}/versions': {
    summary: '上传新版本',
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          'multipart/form-data': {
            schema: documentVersionUploadMetadataSchema.extend({
              file: z.string().openapi({ format: 'binary' }),
            }),
          },
        },
      },
    },
    responses: {
      201: successResponse(documentMutationResponseSchema, '新版本上传成功'),
      404: errorResponse,
    },
  },
  'POST /api/v1/documents/{id}/versions/{versionId}/restore': {
    summary: '恢复到指定版本',
    request: { params: z.object({ id: z.string(), versionId: z.string() }) },
    responses: {
      200: successResponse(documentMutationResponseSchema, '版本已恢复'),
      404: errorResponse,
    },
  },
});
