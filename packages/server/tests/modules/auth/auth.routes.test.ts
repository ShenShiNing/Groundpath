import { describe, expect, it, vi } from 'vitest';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  authenticateRefreshTokenMock,
  loginRateLimiterMock,
  registerRateLimiterMock,
  refreshRateLimiterMock,
  generalRateLimiterMock,
  passwordResetRateLimiterMock,
  requireCsrfProtectionMock,
  validateBodyMock,
  registerRequestSchemaMock,
  registerWithCodeRequestSchemaMock,
  loginRequestSchemaMock,
  changePasswordRequestSchemaMock,
  resetPasswordRequestSchemaMock,
  registerValidatorMock,
  registerWithCodeValidatorMock,
  loginValidatorMock,
  changePasswordValidatorMock,
  resetPasswordValidatorMock,
  authControllerMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    post: vi.fn(),
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  };

  const registerRequestSchema = { type: 'register-schema' };
  const registerWithCodeRequestSchema = { type: 'register-with-code-schema' };
  const loginRequestSchema = { type: 'login-schema' };
  const changePasswordRequestSchema = { type: 'change-password-schema' };
  const resetPasswordRequestSchema = { type: 'reset-password-schema' };

  const registerValidator = vi.fn();
  const registerWithCodeValidator = vi.fn();
  const loginValidator = vi.fn();
  const changePasswordValidator = vi.fn();
  const resetPasswordValidator = vi.fn();

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    authenticateRefreshTokenMock: vi.fn(),
    loginRateLimiterMock: vi.fn(),
    registerRateLimiterMock: vi.fn(),
    refreshRateLimiterMock: vi.fn(),
    generalRateLimiterMock: vi.fn(),
    passwordResetRateLimiterMock: vi.fn(),
    requireCsrfProtectionMock: vi.fn(),
    validateBodyMock: vi.fn((schema: unknown) => {
      if (schema === registerRequestSchema) return registerValidator;
      if (schema === registerWithCodeRequestSchema) return registerWithCodeValidator;
      if (schema === loginRequestSchema) return loginValidator;
      if (schema === changePasswordRequestSchema) return changePasswordValidator;
      if (schema === resetPasswordRequestSchema) return resetPasswordValidator;
      return vi.fn();
    }),
    registerRequestSchemaMock: registerRequestSchema,
    registerWithCodeRequestSchemaMock: registerWithCodeRequestSchema,
    loginRequestSchemaMock: loginRequestSchema,
    changePasswordRequestSchemaMock: changePasswordRequestSchema,
    resetPasswordRequestSchemaMock: resetPasswordRequestSchema,
    registerValidatorMock: registerValidator,
    registerWithCodeValidatorMock: registerWithCodeValidator,
    loginValidatorMock: loginValidator,
    changePasswordValidatorMock: changePasswordValidator,
    resetPasswordValidatorMock: resetPasswordValidator,
    authControllerMock: {
      register: vi.fn(),
      registerWithCode: vi.fn(),
      login: vi.fn(),
      refresh: vi.fn(),
      resetPassword: vi.fn(),
      logout: vi.fn(),
      changePassword: vi.fn(),
      logoutAll: vi.fn(),
      me: vi.fn(),
      sessions: vi.fn(),
      revokeSession: vi.fn(),
    },
  };
});

vi.mock('express', () => ({
  default: { Router: RouterMock },
  Router: RouterMock,
}));

vi.mock('@modules/auth/controllers/auth.controller', () => ({
  authController: authControllerMock,
}));

vi.mock('@shared/middleware', () => ({
  authenticate: authenticateMock,
  authenticateRefreshToken: authenticateRefreshTokenMock,
  loginRateLimiter: loginRateLimiterMock,
  registerRateLimiter: registerRateLimiterMock,
  refreshRateLimiter: refreshRateLimiterMock,
  generalRateLimiter: generalRateLimiterMock,
  passwordResetRateLimiter: passwordResetRateLimiterMock,
  requireCsrfProtection: requireCsrfProtectionMock,
  validateBody: validateBodyMock,
}));

vi.mock('@knowledge-agent/shared/schemas', () => ({
  loginRequestSchema: loginRequestSchemaMock,
  registerRequestSchema: registerRequestSchemaMock,
  changePasswordRequestSchema: changePasswordRequestSchemaMock,
  registerWithCodeRequestSchema: registerWithCodeRequestSchemaMock,
  resetPasswordRequestSchema: resetPasswordRequestSchemaMock,
}));

import authRoutes from '@modules/auth/auth.routes';

describe('auth.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(authRoutes).toBe(mockRouter);
  });

  it('should register validation schemas', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(registerRequestSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(registerWithCodeRequestSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(loginRequestSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(changePasswordRequestSchemaMock);
    expect(validateBodyMock).toHaveBeenCalledWith(resetPasswordRequestSchemaMock);
  });

  it('should register public endpoints', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/register',
      registerRateLimiterMock,
      registerValidatorMock,
      authControllerMock.register
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/register-with-code',
      registerRateLimiterMock,
      registerWithCodeValidatorMock,
      authControllerMock.registerWithCode
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/login',
      loginRateLimiterMock,
      loginValidatorMock,
      authControllerMock.login
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/refresh',
      refreshRateLimiterMock,
      requireCsrfProtectionMock,
      authControllerMock.refresh
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/reset-password',
      passwordResetRateLimiterMock,
      resetPasswordValidatorMock,
      authControllerMock.resetPassword
    );
  });

  it('should register protected refresh-token endpoint', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/logout',
      requireCsrfProtectionMock,
      authenticateRefreshTokenMock,
      authControllerMock.logout
    );
  });

  it('should register protected access-token endpoints', () => {
    expect(mockRouter.put).toHaveBeenCalledWith(
      '/password',
      generalRateLimiterMock,
      authenticateMock,
      changePasswordValidatorMock,
      authControllerMock.changePassword
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/logout-all',
      authenticateMock,
      authControllerMock.logoutAll
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/me',
      generalRateLimiterMock,
      authenticateMock,
      authControllerMock.me
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/sessions',
      generalRateLimiterMock,
      authenticateMock,
      authControllerMock.sessions
    );
    expect(mockRouter.delete).toHaveBeenCalledWith(
      '/sessions/:id',
      generalRateLimiterMock,
      authenticateMock,
      authControllerMock.revokeSession
    );
  });
});
