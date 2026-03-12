import { z } from '@knowledge-agent/shared/schemas';
import { registry, messageResponse, errorResponse } from '../registry';
import {
  sendVerificationCodeRequestSchema,
  verifyCodeRequestSchema,
} from '@knowledge-agent/shared/schemas';

// POST /api/auth/email/send-code
registry.registerPath({
  method: 'post',
  path: '/api/auth/email/send-code',
  tags: ['Email Verification'],
  summary: '发送邮箱验证码',
  request: {
    body: { content: { 'application/json': { schema: sendVerificationCodeRequestSchema } } },
  },
  responses: { 200: messageResponse('验证码已发送'), 429: errorResponse },
});

// POST /api/auth/email/verify-code
registry.registerPath({
  method: 'post',
  path: '/api/auth/email/verify-code',
  tags: ['Email Verification'],
  summary: '验证邮箱验证码',
  request: { body: { content: { 'application/json': { schema: verifyCodeRequestSchema } } } },
  responses: {
    200: {
      description: '验证成功',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({ verificationToken: z.string(), expiresIn: z.number() }),
          }),
        },
      },
    },
    400: errorResponse,
  },
});
