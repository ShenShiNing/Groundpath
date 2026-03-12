import { z } from '@knowledge-agent/shared/schemas';
import { registry, successResponse, errorResponse } from '../registry';
import { oauthExchangeRequestSchema } from '@knowledge-agent/shared/schemas';

const oauthRedirect = {
  description: '重定向到 OAuth 提供商',
  content: { 'application/json': { schema: z.object({}) } },
};

// GET /api/auth/oauth/github
registry.registerPath({
  method: 'get',
  path: '/api/auth/oauth/github',
  tags: ['OAuth'],
  summary: 'GitHub OAuth 授权',
  responses: { 302: oauthRedirect },
});

// GET /api/auth/oauth/github/callback
registry.registerPath({
  method: 'get',
  path: '/api/auth/oauth/github/callback',
  tags: ['OAuth'],
  summary: 'GitHub OAuth 回调',
  responses: { 302: oauthRedirect },
});

// GET /api/auth/oauth/google
registry.registerPath({
  method: 'get',
  path: '/api/auth/oauth/google',
  tags: ['OAuth'],
  summary: 'Google OAuth 授权',
  responses: { 302: oauthRedirect },
});

// GET /api/auth/oauth/google/callback
registry.registerPath({
  method: 'get',
  path: '/api/auth/oauth/google/callback',
  tags: ['OAuth'],
  summary: 'Google OAuth 回调',
  responses: { 302: oauthRedirect },
});

// POST /api/auth/oauth/exchange
registry.registerPath({
  method: 'post',
  path: '/api/auth/oauth/exchange',
  tags: ['OAuth'],
  summary: 'OAuth 令牌交换',
  request: { body: { content: { 'application/json': { schema: oauthExchangeRequestSchema } } } },
  responses: {
    200: successResponse(
      z.object({
        accessToken: z.string(),
        user: z.object({
          id: z.string(),
          username: z.string(),
          email: z.string(),
          avatarUrl: z.string().nullable(),
        }),
      }),
      'OAuth 登录成功'
    ),
    400: errorResponse,
  },
});
