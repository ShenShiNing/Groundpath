import { describe, expect, it, vi } from 'vitest';

const {
  mockRouter,
  RouterMock,
  emailSendRateLimiterMock,
  emailVerifyRateLimiterMock,
  validateBodyMock,
  sendVerificationCodeRequestSchemaMock,
  verifyCodeRequestSchemaMock,
  sendCodeValidatorMock,
  verifyCodeValidatorMock,
  emailControllerMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    post: vi.fn(),
  };

  const sendVerificationCodeRequestSchema = { type: 'send-code-schema' };
  const verifyCodeRequestSchema = { type: 'verify-code-schema' };
  const sendCodeValidator = vi.fn();
  const verifyCodeValidator = vi.fn();

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    emailSendRateLimiterMock: vi.fn(),
    emailVerifyRateLimiterMock: vi.fn(),
    validateBodyMock: vi.fn((schema: unknown) => {
      if (schema === sendVerificationCodeRequestSchema) return sendCodeValidator;
      if (schema === verifyCodeRequestSchema) return verifyCodeValidator;
      return vi.fn();
    }),
    sendVerificationCodeRequestSchemaMock: sendVerificationCodeRequestSchema,
    verifyCodeRequestSchemaMock: verifyCodeRequestSchema,
    sendCodeValidatorMock: sendCodeValidator,
    verifyCodeValidatorMock: verifyCodeValidator,
    emailControllerMock: {
      sendCode: vi.fn(),
      verifyCode: vi.fn(),
    },
  };
});

vi.mock('express', () => ({
  default: { Router: RouterMock },
  Router: RouterMock,
}));

vi.mock('@modules/auth/verification/email.controller', () => ({
  emailController: emailControllerMock,
}));

vi.mock('@shared/middleware', () => ({
  emailSendRateLimiter: emailSendRateLimiterMock,
  emailVerifyRateLimiter: emailVerifyRateLimiterMock,
  validateBody: validateBodyMock,
}));

vi.mock('@knowledge-agent/shared/schemas', () => ({
  sendVerificationCodeRequestSchema: sendVerificationCodeRequestSchemaMock,
  verifyCodeRequestSchema: verifyCodeRequestSchemaMock,
}));

import emailRoutes from '@modules/auth/verification/email.routes';

describe('email.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(emailRoutes).toBe(mockRouter);
  });

  it('should register schema validators', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(sendVerificationCodeRequestSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(verifyCodeRequestSchemaMock);
  });

  it('should register email verification endpoints', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/send-code',
      emailSendRateLimiterMock,
      sendCodeValidatorMock,
      emailControllerMock.sendCode
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/verify-code',
      emailVerifyRateLimiterMock,
      verifyCodeValidatorMock,
      emailControllerMock.verifyCode
    );
  });
});
