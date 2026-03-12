import { z } from '@knowledge-agent/shared/schemas';
import { registry, errorResponse } from '../registry';

// GET /api/files/*
registry.registerPath({
  method: 'get',
  path: '/api/files/{key}',
  tags: ['Storage'],
  summary: '获取签名文件',
  description: '通过签名 URL 访问存储文件',
  request: {
    params: z.object({ key: z.string() }),
    query: z.object({ signature: z.string(), expires: z.string() }),
  },
  responses: { 200: { description: '文件流' }, 403: errorResponse },
});
