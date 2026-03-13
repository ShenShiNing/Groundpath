import { describe, expect, it, vi } from 'vitest';

const {
  mockRouter,
  RouterMock,
  requireCsrfProtectionMock,
  validateBodyMock,
  oauthExchangeRequestSchemaMock,
  exchangeValidatorMock,
  oauthControllerMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    get: vi.fn(),
    post: vi.fn(),
  };

  const oauthExchangeRequestSchema = { type: 'oauth-exchange-schema' };
  const exchangeValidator = vi.fn();

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    requireCsrfProtectionMock: vi.fn(),
    validateBodyMock: vi.fn((schema: unknown) =>
      schema === oauthExchangeRequestSchema ? exchangeValidator : vi.fn()
    ),
    oauthExchangeRequestSchemaMock: oauthExchangeRequestSchema,
    exchangeValidatorMock: exchangeValidator,
    oauthControllerMock: {
      githubAuth: vi.fn(),
      githubCallback: vi.fn(),
      googleAuth: vi.fn(),
      googleCallback: vi.fn(),
      exchange: vi.fn(),
    },
  };
});

vi.mock('express', () => ({
  default: { Router: RouterMock },
  Router: RouterMock,
}));

vi.mock('@modules/auth/oauth/oauth.controller', () => ({
  oauthController: oauthControllerMock,
}));

vi.mock('@core/middleware', () => ({
  requireCsrfProtection: requireCsrfProtectionMock,
  validateBody: validateBodyMock,
}));

vi.mock('@knowledge-agent/shared/schemas', () => ({
  oauthExchangeRequestSchema: oauthExchangeRequestSchemaMock,
}));

import oauthRoutes from '@modules/auth/oauth/oauth.routes';

describe('oauth.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(oauthRoutes).toBe(mockRouter);
  });

  it('should register oauth callback endpoints', () => {
    expect(mockRouter.get).toHaveBeenCalledWith('/github', oauthControllerMock.githubAuth);
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/github/callback',
      oauthControllerMock.githubCallback
    );
    expect(mockRouter.get).toHaveBeenCalledWith('/google', oauthControllerMock.googleAuth);
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/google/callback',
      oauthControllerMock.googleCallback
    );
  });

  it('should register exchange endpoint with csrf and body validation', () => {
    expect(validateBodyMock).toHaveBeenCalledWith(oauthExchangeRequestSchemaMock);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/exchange',
      requireCsrfProtectionMock,
      exchangeValidatorMock,
      oauthControllerMock.exchange
    );
  });
});
