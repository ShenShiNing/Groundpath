import { z } from '@knowledge-agent/shared/schemas';
import { registry, successResponse, messageResponse, errorResponse, PROTECTED } from '../registry';
import {
  loginRequestSchema,
  registerRequestSchema,
  registerWithCodeRequestSchema,
  changePasswordRequestSchema,
  resetPasswordRequestSchema,
} from '@knowledge-agent/shared/schemas';

const authTokenData = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
  }),
});

const sessionItem = z.object({
  id: z.string(),
  deviceInfo: z
    .object({
      userAgent: z.string().optional(),
      deviceType: z.string().optional(),
      os: z.string().optional(),
      browser: z.string().optional(),
    })
    .nullable(),
  ipAddress: z.string().nullable(),
  lastUsedAt: z.string(),
  createdAt: z.string(),
  isCurrent: z.boolean(),
});

// POST /api/auth/register
registry.registerPath({
  method: 'post',
  path: '/api/auth/register',
  tags: ['Auth'],
  summary: '注册新用户',
  request: { body: { content: { 'application/json': { schema: registerRequestSchema } } } },
  responses: { 201: successResponse(authTokenData, '注册成功'), 400: errorResponse },
});

// POST /api/auth/register-with-code
registry.registerPath({
  method: 'post',
  path: '/api/auth/register-with-code',
  tags: ['Auth'],
  summary: '通过邮箱验证码注册',
  request: { body: { content: { 'application/json': { schema: registerWithCodeRequestSchema } } } },
  responses: { 201: successResponse(authTokenData, '注册成功'), 400: errorResponse },
});

// POST /api/auth/login
registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  tags: ['Auth'],
  summary: '邮箱密码登录',
  request: { body: { content: { 'application/json': { schema: loginRequestSchema } } } },
  responses: { 200: successResponse(authTokenData, '登录成功'), 401: errorResponse },
});

// POST /api/auth/refresh
registry.registerPath({
  method: 'post',
  path: '/api/auth/refresh',
  tags: ['Auth'],
  summary: '刷新访问令牌',
  description: '使用 HttpOnly cookie 中的 refresh token 获取新的 access token',
  responses: { 200: successResponse(authTokenData, '刷新成功'), 401: errorResponse },
});

// POST /api/auth/reset-password
registry.registerPath({
  method: 'post',
  path: '/api/auth/reset-password',
  tags: ['Auth'],
  summary: '重置密码（需邮箱验证）',
  request: { body: { content: { 'application/json': { schema: resetPasswordRequestSchema } } } },
  responses: { 200: messageResponse('密码重置成功'), 400: errorResponse },
});

// POST /api/auth/logout
registry.registerPath({
  method: 'post',
  path: '/api/auth/logout',
  tags: ['Auth'],
  summary: '登出当前设备',
  responses: { 200: messageResponse('登出成功'), 401: errorResponse },
});

// POST /api/auth/logout-all
registry.registerPath({
  method: 'post',
  path: '/api/auth/logout-all',
  tags: ['Auth'],
  summary: '登出所有设备',
  security: PROTECTED,
  responses: {
    200: successResponse(
      z.object({ message: z.string(), revokedCount: z.number() }),
      '全部登出成功'
    ),
    401: errorResponse,
  },
});

// PUT /api/auth/password
registry.registerPath({
  method: 'put',
  path: '/api/auth/password',
  tags: ['Auth'],
  summary: '修改密码',
  security: PROTECTED,
  request: { body: { content: { 'application/json': { schema: changePasswordRequestSchema } } } },
  responses: { 200: messageResponse('密码修改成功'), 400: errorResponse },
});

// GET /api/auth/me
registry.registerPath({
  method: 'get',
  path: '/api/auth/me',
  tags: ['Auth'],
  summary: '获取当前用户信息',
  security: PROTECTED,
  responses: {
    200: successResponse(
      z.object({
        id: z.string(),
        username: z.string(),
        email: z.string(),
        avatarUrl: z.string().nullable(),
        bio: z.string().nullable(),
        status: z.string(),
        emailVerified: z.boolean(),
      }),
      '当前用户信息'
    ),
    401: errorResponse,
  },
});

// GET /api/auth/sessions
registry.registerPath({
  method: 'get',
  path: '/api/auth/sessions',
  tags: ['Auth'],
  summary: '获取活跃会话列表',
  security: PROTECTED,
  responses: { 200: successResponse(z.array(sessionItem), '会话列表'), 401: errorResponse },
});

// DELETE /api/auth/sessions/{id}
registry.registerPath({
  method: 'delete',
  path: '/api/auth/sessions/{id}',
  tags: ['Auth'],
  summary: '撤销指定会话',
  security: PROTECTED,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: messageResponse('会话已撤销'), 401: errorResponse },
});
