import type { Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import type { HttpTestBody } from '@tests/helpers/http';

const {
  authenticateMock,
  loginLogServiceMock,
  operationLogServiceMock,
  structuredRagDashboardServiceMock,
  structuredRagReportServiceMock,
} = vi.hoisted(() => {
  const authenticate: RequestHandler = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const isAuthorized =
      (typeof authHeader === 'string' &&
        authHeader.replace(/^Bearer\s+/i, '') === 'valid-access') ||
      (Array.isArray(authHeader) &&
        authHeader.some((value) => value.replace(/^Bearer\s+/i, '') === 'valid-access'));

    if (isAuthorized) {
      req.user = {
        sub: 'user-1',
        sid: 'sid-1',
        email: 'user-1@example.com',
        username: 'user1',
        status: 'active',
        emailVerified: true,
      };
      next();
      return;
    }

    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid access token' },
    });
  };

  return {
    authenticateMock: vi.fn(authenticate),
    loginLogServiceMock: {
      list: vi.fn(async () => ({
        items: [{ id: 'login-1', success: true, authType: 'email' }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      })),
      getRecent: vi.fn(async () => [{ id: 'login-recent-1' }]),
    },
    operationLogServiceMock: {
      list: vi.fn(async () => ({
        items: [{ id: 'op-1', action: 'document.upload' }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      })),
      getResourceHistory: vi.fn(async () => [{ id: 'op-resource-1' }]),
    },
    structuredRagDashboardServiceMock: {
      getSummary: vi.fn(async () => ({
        windowHours: 24,
        filters: { knowledgeBaseId: null },
        agent: {
          totalExecutions: 10,
          fallbackRatio: 20,
          budgetExhaustionRate: 5,
          toolTimeoutRate: 2,
          providerErrorRate: 1,
          insufficientEvidenceRate: 10,
          avgDurationMs: 1200,
          avgFinalCitationCount: 1.4,
          avgRetrievedCitationCount: 2.2,
        },
        index: {
          totalBuilds: 8,
          parseSuccessRate: 87.5,
          structuredRequestRate: 75,
          structuredCoverage: 62.5,
          avgParseDurationMs: 900,
          avgFreshnessLagMs: 1500,
          graphBuilds: 4,
          totalNodes: 120,
          totalEdges: 80,
        },
        trendGranularity: 'hour',
        alerts: [],
        trend: [],
        knowledgeBaseBreakdown: [],
        recentEvents: [],
      })),
    },
    structuredRagReportServiceMock: {
      generateReport: vi.fn(async () => ({
        generatedAt: new Date('2026-03-09T00:00:00.000Z'),
        windowDays: 30,
        filters: {
          knowledgeBaseId: null,
          userScoped: true,
        },
        highlights: ['Fallback ratio elevated'],
        summary: {
          windowHours: 24,
          trendGranularity: 'hour',
          filters: { knowledgeBaseId: null },
          agent: {
            totalExecutions: 10,
            fallbackRatio: 20,
            budgetExhaustionRate: 5,
            toolTimeoutRate: 2,
            providerErrorRate: 1,
            insufficientEvidenceRate: 10,
            avgDurationMs: 1200,
            avgFinalCitationCount: 1.4,
            avgRetrievedCitationCount: 2.2,
          },
          index: {
            totalBuilds: 8,
            parseSuccessRate: 87.5,
            structuredRequestRate: 75,
            structuredCoverage: 62.5,
            avgParseDurationMs: 900,
            avgFreshnessLagMs: 1500,
            graphBuilds: 4,
            totalNodes: 120,
            totalEdges: 80,
          },
          alerts: [],
          trend: [],
          knowledgeBaseBreakdown: [],
          recentEvents: [],
        },
        markdown: '# Structured RAG Report',
      })),
    },
  };
});

vi.mock('@shared/middleware', async () => {
  const actual = await vi.importActual<typeof import('@shared/middleware')>('@shared/middleware');
  return {
    ...actual,
    authenticate: authenticateMock,
  };
});

vi.mock('@modules/logs/services/login-log.service', () => ({
  loginLogService: loginLogServiceMock,
}));

vi.mock('@modules/logs/services/operation-log.service', () => ({
  operationLogService: operationLogServiceMock,
}));

vi.mock('@modules/logs/services/structured-rag-dashboard.service', () => ({
  structuredRagDashboardService: structuredRagDashboardServiceMock,
}));

vi.mock('@modules/logs/services/structured-rag-report.service', () => ({
  structuredRagReportService: structuredRagReportServiceMock,
}));

import logsRoutes from '@modules/logs/logs.routes';

describe('logs.routes http behavior', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/logs', logsRoutes);
    app.use(
      (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          'message' in err &&
          'statusCode' in err &&
          typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ) {
          const appError = err as { code: string; message: string; statusCode: number };
          res.status(appError.statusCode).json({
            success: false,
            error: { code: appError.code, message: appError.message },
          });
          return;
        }

        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        });
      }
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get test server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject unauthenticated login-log request', async () => {
    const response = await fetch(`${baseUrl}/logs/login`);
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(loginLogServiceMock.list).not.toHaveBeenCalled();
  });

  it('should validate login-log query params', async () => {
    const response = await fetch(`${baseUrl}/logs/login?page=0&pageSize=20`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(loginLogServiceMock.list).not.toHaveBeenCalled();
  });

  it('should call login-log list with parsed filters', async () => {
    const response = await fetch(
      `${baseUrl}/logs/login?page=1&pageSize=20&success=true&authType=email`,
      {
        headers: { authorization: 'Bearer valid-access' },
      }
    );
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(loginLogServiceMock.list).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        success: true,
        authType: 'email',
      })
    );
  });

  it('should cap recent login limit at 50', async () => {
    const response = await fetch(`${baseUrl}/logs/login/recent?limit=999`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(loginLogServiceMock.getRecent).toHaveBeenCalledWith('user-1', 50);
  });

  it('should validate operation-log query enums', async () => {
    const response = await fetch(`${baseUrl}/logs/operations?action=not-supported`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(operationLogServiceMock.list).not.toHaveBeenCalled();
  });

  it('should list operation logs with valid params', async () => {
    const response = await fetch(
      `${baseUrl}/logs/operations?page=1&pageSize=20&resourceType=document&action=document.upload`,
      {
        headers: { authorization: 'Bearer valid-access' },
      }
    );
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(operationLogServiceMock.list).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        resourceType: 'document',
        action: 'document.upload',
      })
    );
  });

  it('should reject invalid resource type for resource-history', async () => {
    const response = await fetch(`${baseUrl}/logs/operations/resource/invalid/doc-1?limit=20`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(operationLogServiceMock.getResourceHistory).not.toHaveBeenCalled();
  });

  it('should validate resource-history query params', async () => {
    const response = await fetch(`${baseUrl}/logs/operations/resource/document/doc-1?limit=101`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(operationLogServiceMock.getResourceHistory).not.toHaveBeenCalled();
  });

  it('should get resource history with valid params', async () => {
    const response = await fetch(`${baseUrl}/logs/operations/resource/document/doc-1?limit=20`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(operationLogServiceMock.getResourceHistory).toHaveBeenCalledWith(
      'document',
      'doc-1',
      'user-1',
      20
    );
  });

  it('should validate structured rag summary query params', async () => {
    const response = await fetch(`${baseUrl}/logs/structured-rag/summary?hours=0`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(structuredRagDashboardServiceMock.getSummary).not.toHaveBeenCalled();
  });

  it('should return structured rag summary with parsed filters', async () => {
    const response = await fetch(
      `${baseUrl}/logs/structured-rag/summary?hours=48&recentLimit=5&knowledgeBaseId=550e8400-e29b-41d4-a716-446655440000`,
      {
        headers: { authorization: 'Bearer valid-access' },
      }
    );
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(structuredRagDashboardServiceMock.getSummary).toHaveBeenCalledWith({
      userId: 'user-1',
      hours: 48,
      recentLimit: 5,
      knowledgeBaseId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('should validate structured rag report query params', async () => {
    const response = await fetch(`${baseUrl}/logs/structured-rag/report?days=3`, {
      headers: { authorization: 'Bearer valid-access' },
    });
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(structuredRagReportServiceMock.generateReport).not.toHaveBeenCalled();
  });

  it('should return structured rag report with parsed filters', async () => {
    const response = await fetch(
      `${baseUrl}/logs/structured-rag/report?days=60&knowledgeBaseId=550e8400-e29b-41d4-a716-446655440000`,
      {
        headers: { authorization: 'Bearer valid-access' },
      }
    );
    const body = (await response.json()) as HttpTestBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(structuredRagReportServiceMock.generateReport).toHaveBeenCalledWith({
      userId: 'user-1',
      days: 60,
      knowledgeBaseId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });
});
