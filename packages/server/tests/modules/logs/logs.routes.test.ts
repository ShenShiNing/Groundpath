import { describe, expect, it, vi } from 'vitest';

const {
  mockRouter,
  RouterMock,
  authenticateMock,
  validateQueryMock,
  loginValidatorMock,
  operationValidatorMock,
  resourceValidatorMock,
  loginLogControllerMock,
  operationLogControllerMock,
  loginLogQuerySchemaMock,
  operationLogQuerySchemaMock,
  resourceHistorySchemaMock,
} = vi.hoisted(() => {
  const hoistedRouter = {
    use: vi.fn(),
    get: vi.fn(),
  };

  const loginValidator = vi.fn();
  const operationValidator = vi.fn();
  const resourceValidator = vi.fn();

  const loginLogQuerySchema = { type: 'login-log-query-schema' };
  const operationLogQuerySchema = { type: 'operation-log-query-schema' };
  const resourceHistorySchema = { type: 'resource-history-schema' };

  return {
    mockRouter: hoistedRouter,
    RouterMock: vi.fn(() => hoistedRouter),
    authenticateMock: vi.fn(),
    validateQueryMock: vi.fn((schema: unknown) => {
      if (schema === loginLogQuerySchema) return loginValidator;
      if (schema === operationLogQuerySchema) return operationValidator;
      if (schema === resourceHistorySchema) return resourceValidator;
      return vi.fn();
    }),
    loginValidatorMock: loginValidator,
    operationValidatorMock: operationValidator,
    resourceValidatorMock: resourceValidator,
    loginLogControllerMock: {
      list: vi.fn(),
      recent: vi.fn(),
    },
    operationLogControllerMock: {
      list: vi.fn(),
      resourceHistory: vi.fn(),
    },
    loginLogQuerySchemaMock: loginLogQuerySchema,
    operationLogQuerySchemaMock: operationLogQuerySchema,
    resourceHistorySchemaMock: resourceHistorySchema,
  };
});

vi.mock('express', () => ({
  default: { Router: RouterMock },
  Router: RouterMock,
}));

vi.mock('@shared/middleware', () => ({
  authenticate: authenticateMock,
  validateQuery: validateQueryMock,
}));

vi.mock('@knowledge-agent/shared/schemas', () => ({
  loginLogQuerySchema: loginLogQuerySchemaMock,
  operationLogQuerySchema: operationLogQuerySchemaMock,
  resourceHistorySchema: resourceHistorySchemaMock,
}));

vi.mock('@modules/logs/controllers/login-log.controller', () => ({
  loginLogController: loginLogControllerMock,
}));

vi.mock('@modules/logs/controllers/operation-log.controller', () => ({
  operationLogController: operationLogControllerMock,
}));

import logsRoutes from '@modules/logs/logs.routes';

describe('logs.routes', () => {
  it('should create router once and export it', () => {
    expect(RouterMock).toHaveBeenCalledTimes(1);
    expect(logsRoutes).toBe(mockRouter);
  });

  it('should register auth middleware', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(authenticateMock);
  });

  it('should register query validators', () => {
    expect(validateQueryMock).toHaveBeenCalledWith(loginLogQuerySchemaMock);
    expect(validateQueryMock).toHaveBeenCalledWith(operationLogQuerySchemaMock);
    expect(validateQueryMock).toHaveBeenCalledWith(resourceHistorySchemaMock);
  });

  it('should register login log endpoints', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/login',
      loginValidatorMock,
      loginLogControllerMock.list
    );
    expect(mockRouter.get).toHaveBeenCalledWith('/login/recent', loginLogControllerMock.recent);
  });

  it('should register operation log endpoints', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/operations',
      operationValidatorMock,
      operationLogControllerMock.list
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/operations/resource/:resourceType/:resourceId',
      resourceValidatorMock,
      operationLogControllerMock.resourceHistory
    );
  });
});
