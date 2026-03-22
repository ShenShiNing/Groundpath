import { z } from '@groundpath/shared/schemas';
import { errorResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

export const storageOpenApiOperations = defineOpenApiOperations({
  'GET /api/files/{key}': {
    summary: '获取签名文件',
    description: '通过签名 URL 访问存储文件',
    request: {
      params: z.object({ key: z.string() }),
      query: z.object({ signature: z.string(), expires: z.string() }),
    },
    responses: { 200: { description: '文件流' }, 403: errorResponse },
  },
});
