import { z } from '@knowledge-agent/shared/schemas';
import {
  sendVerificationCodeRequestSchema,
  verifyCodeRequestSchema,
} from '@knowledge-agent/shared/schemas';
import { errorResponse, messageResponse } from '../registry';
import { defineOpenApiOperations } from '../route-metadata';

export const emailOpenApiOperations = defineOpenApiOperations({
  'POST /api/auth/email/send-code': {
    summary: '发送邮箱验证码',
    request: {
      body: { content: { 'application/json': { schema: sendVerificationCodeRequestSchema } } },
    },
    responses: { 200: messageResponse('验证码已发送'), 429: errorResponse },
  },
  'POST /api/auth/email/verify-code': {
    summary: '验证邮箱验证码',
    request: { body: { content: { 'application/json': { schema: verifyCodeRequestSchema } } } },
    responses: {
      200: {
        description: '验证成功',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(true),
              data: z.object({ verificationToken: z.string(), expiresAt: z.string() }),
            }),
          },
        },
      },
      400: errorResponse,
    },
  },
});
