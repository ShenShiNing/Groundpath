import express from 'express';
import { authenticate, validateQuery } from '@core/middleware';
import {
  loginLogQuerySchema,
  operationLogQuerySchema,
  resourceHistorySchema,
  structuredRagDashboardQuerySchema,
  structuredRagReportQuerySchema,
} from '@groundpath/shared/schemas';
import { logsRouteHandlers } from './logs.route-handlers';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ==================== Login Logs ====================

/**
 * GET /api/logs/login
 * List current user's login history
 */
router.get('/login', validateQuery(loginLogQuerySchema), logsRouteHandlers.loginLogController.list);

/**
 * GET /api/logs/login/recent
 * Get recent login history (simplified)
 */
router.get('/login/recent', logsRouteHandlers.loginLogController.recent);

// ==================== Structured RAG Dashboard ====================

router.get(
  '/structured-rag/summary',
  validateQuery(structuredRagDashboardQuerySchema),
  logsRouteHandlers.structuredRagDashboardController.summary
);
router.get(
  '/structured-rag/report',
  validateQuery(structuredRagReportQuerySchema),
  logsRouteHandlers.structuredRagReportController.report
);

// ==================== Operation Logs ====================

/**
 * GET /api/logs/operations
 * List current user's operation history
 */
router.get(
  '/operations',
  validateQuery(operationLogQuerySchema),
  logsRouteHandlers.operationLogController.list
);

/**
 * GET /api/logs/operations/resource/:resourceType/:resourceId
 * Get operation history for a specific resource
 */
router.get(
  '/operations/resource/:resourceType/:resourceId',
  validateQuery(resourceHistorySchema),
  logsRouteHandlers.operationLogController.resourceHistory
);

export default router;
