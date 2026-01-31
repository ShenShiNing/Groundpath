import express from 'express';
import { emailController } from './email.controller';
import {
  emailSendRateLimiter,
  emailVerifyRateLimiter,
} from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validation.middleware';
import {
  sendVerificationCodeRequestSchema,
  verifyCodeRequestSchema,
} from '@knowledge-agent/shared/schemas';

const router = express.Router();

// Send verification code
router.post(
  '/send-code',
  emailSendRateLimiter,
  validateBody(sendVerificationCodeRequestSchema),
  emailController.sendCode
);

// Verify code
router.post(
  '/verify-code',
  emailVerifyRateLimiter,
  validateBody(verifyCodeRequestSchema),
  emailController.verifyCode
);

export default router;
