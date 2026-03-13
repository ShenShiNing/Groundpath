import { z } from '@knowledge-agent/shared/schemas';
import {
  registry,
  successResponse,
  paginatedResponse,
  messageResponse,
  errorResponse,
  PROTECTED,
} from '../registry';
import {
  updateDocumentRequestSchema,
  saveDocumentContentSchema,
  documentListParamsSchema,
  trashListParamsSchema,
} from '@knowledge-agent/shared/schemas';

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

// GET /api/documents/trash
registry.registerPath({
  method: 'get',
  path: '/api/documents/trash',
  tags: ['Document'],
  summary: '列出垃圾桶文档',
  security: PROTECTED,
  request: { query: trashListParamsSchema },
  responses: { 200: paginatedResponse(documentItem, '垃圾桶文档列表') },
});

// DELETE /api/documents/trash
registry.registerPath({
  method: 'delete',
  path: '/api/documents/trash',
  tags: ['Document'],
  summary: '清空垃圾桶',
  security: PROTECTED,
  responses: { 200: messageResponse('垃圾桶已清空') },
});

// POST /api/documents/{id}/restore
registry.registerPath({
  method: 'post',
  path: '/api/documents/{id}/restore',
  tags: ['Document'],
  summary: '从垃圾桶恢复文档',
  security: PROTECTED,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: messageResponse('文档已恢复'), 404: errorResponse },
});

// DELETE /api/documents/{id}/permanent
registry.registerPath({
  method: 'delete',
  path: '/api/documents/{id}/permanent',
  tags: ['Document'],
  summary: '永久删除文档',
  security: PROTECTED,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: messageResponse('文档已永久删除'), 404: errorResponse },
});

// POST /api/documents
registry.registerPath({
  method: 'post',
  path: '/api/documents',
  tags: ['Document'],
  summary: '上传文档',
  security: PROTECTED,
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
});

// GET /api/documents
registry.registerPath({
  method: 'get',
  path: '/api/documents',
  tags: ['Document'],
  summary: '列出文档',
  security: PROTECTED,
  request: { query: documentListParamsSchema },
  responses: { 200: paginatedResponse(documentItem, '文档列表') },
});

// GET /api/documents/{id}
registry.registerPath({
  method: 'get',
  path: '/api/documents/{id}',
  tags: ['Document'],
  summary: '获取文档详情',
  security: PROTECTED,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: successResponse(documentItem, '文档详情'), 404: errorResponse },
});

// PATCH /api/documents/{id}
registry.registerPath({
  method: 'patch',
  path: '/api/documents/{id}',
  tags: ['Document'],
  summary: '更新文档信息',
  security: PROTECTED,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: updateDocumentRequestSchema } } },
  },
  responses: { 200: successResponse(documentItem, '文档更新成功'), 404: errorResponse },
});

// DELETE /api/documents/{id}
registry.registerPath({
  method: 'delete',
  path: '/api/documents/{id}',
  tags: ['Document'],
  summary: '删除文档（移入垃圾桶）',
  security: PROTECTED,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: messageResponse('文档已移入垃圾桶'), 404: errorResponse },
});

// GET /api/documents/{id}/content
registry.registerPath({
  method: 'get',
  path: '/api/documents/{id}/content',
  tags: ['Document'],
  summary: '获取文档内容',
  security: PROTECTED,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: successResponse(z.object({ content: z.string() }), '文档内容'),
    404: errorResponse,
  },
});

// PUT /api/documents/{id}/content
registry.registerPath({
  method: 'put',
  path: '/api/documents/{id}/content',
  tags: ['Document'],
  summary: '保存文档内容',
  security: PROTECTED,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: saveDocumentContentSchema } } },
  },
  responses: { 200: messageResponse('文档内容已保存'), 404: errorResponse },
});

// GET /api/documents/{id}/download
registry.registerPath({
  method: 'get',
  path: '/api/documents/{id}/download',
  tags: ['Document'],
  summary: '下载文档',
  security: PROTECTED,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: '文件流' }, 404: errorResponse },
});

// GET /api/documents/{id}/preview
registry.registerPath({
  method: 'get',
  path: '/api/documents/{id}/preview',
  tags: ['Document'],
  summary: '预览文档',
  security: PROTECTED,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: '预览内容' }, 404: errorResponse },
});

// GET /api/documents/{id}/versions
registry.registerPath({
  method: 'get',
  path: '/api/documents/{id}/versions',
  tags: ['Document'],
  summary: '获取文档版本历史',
  security: PROTECTED,
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
});

// POST /api/documents/{id}/versions
registry.registerPath({
  method: 'post',
  path: '/api/documents/{id}/versions',
  tags: ['Document'],
  summary: '上传新版本',
  security: PROTECTED,
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
});

// POST /api/documents/{id}/versions/{versionId}/restore
registry.registerPath({
  method: 'post',
  path: '/api/documents/{id}/versions/{versionId}/restore',
  tags: ['Document'],
  summary: '恢复到指定版本',
  security: PROTECTED,
  request: { params: z.object({ id: z.string(), versionId: z.string() }) },
  responses: { 200: messageResponse('版本已恢复'), 404: errorResponse },
});
