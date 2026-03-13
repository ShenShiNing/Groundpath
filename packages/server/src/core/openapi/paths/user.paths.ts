import { z } from '@knowledge-agent/shared/schemas';
import { updateProfileRequestSchema } from '@knowledge-agent/shared/schemas';
import { errorResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

export const userOpenApiOperations = defineOpenApiOperations({
  'PATCH /api/user/profile': {
    summary: '更新个人资料',
    request: { body: { content: { 'application/json': { schema: updateProfileRequestSchema } } } },
    responses: {
      200: successResponse(
        z.object({
          id: z.string(),
          username: z.string(),
          bio: z.string().nullable(),
          avatarUrl: z.string().nullable(),
        }),
        '资料更新成功'
      ),
      400: errorResponse,
    },
  },
  'POST /api/user/avatar': {
    summary: '上传头像',
    request: {
      body: {
        content: {
          'multipart/form-data': {
            schema: z.object({ avatar: z.string().openapi({ format: 'binary' }) }),
          },
        },
      },
    },
    responses: {
      200: successResponse(z.object({ avatarUrl: z.string() }), '头像上传成功'),
      400: errorResponse,
    },
  },
});
