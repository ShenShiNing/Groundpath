import { z } from '@groundpath/shared/schemas';
import { oauthExchangeRequestSchema } from '@groundpath/shared/schemas';
import { errorResponse, successResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

const oauthRedirect = {
  description: '重定向到 OAuth 提供商',
  content: { 'application/json': { schema: z.object({}) } },
};

export const oauthOpenApiOperations = defineOpenApiOperations({
  'GET /api/auth/oauth/github': {
    summary: 'GitHub OAuth 授权',
    responses: { 302: oauthRedirect },
  },
  'GET /api/auth/oauth/github/callback': {
    summary: 'GitHub OAuth 回调',
    responses: { 302: oauthRedirect },
  },
  'GET /api/auth/oauth/google': {
    summary: 'Google OAuth 授权',
    responses: { 302: oauthRedirect },
  },
  'GET /api/auth/oauth/google/callback': {
    summary: 'Google OAuth 回调',
    responses: { 302: oauthRedirect },
  },
  'POST /api/auth/oauth/exchange': {
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
  },
});
