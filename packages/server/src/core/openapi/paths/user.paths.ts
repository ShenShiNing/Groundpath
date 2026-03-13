import { z } from '@knowledge-agent/shared/schemas';
import { registry, successResponse, errorResponse, PROTECTED } from '../registry';
import { updateProfileRequestSchema } from '@knowledge-agent/shared/schemas';

// PATCH /api/user/profile
registry.registerPath({
  method: 'patch',
  path: '/api/user/profile',
  tags: ['User'],
  summary: '更新个人资料',
  security: PROTECTED,
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
});

// POST /api/user/avatar
registry.registerPath({
  method: 'post',
  path: '/api/user/avatar',
  tags: ['User'],
  summary: '上传头像',
  security: PROTECTED,
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
});
