import express from 'express';
import { authenticate, validateQuery } from '@shared/middleware';
import { loginLogController } from './controllers/login-log.controller';
import { operationLogController } from './controllers/operation-log.controller';
import {
  loginLogQuerySchema,
  operationLogQuerySchema,
  resourceHistorySchema,
} from './schemas/log-query.schemas';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ==================== Login Logs ====================

/**
 * GET /api/logs/login
 * List current user's login history
 */
router.get('/login', validateQuery(loginLogQuerySchema), loginLogController.list);

/**
 * GET /api/logs/login/recent
 * Get recent login history (simplified)
 */
router.get('/login/recent', loginLogController.recent);

// ==================== Operation Logs ====================

/**
 * GET /api/logs/operations
 * List current user's operation history
 */
router.get('/operations', validateQuery(operationLogQuerySchema), operationLogController.list);

/**
 * GET /api/logs/operations/resource/:resourceType/:resourceId
 * Get operation history for a specific resource
 */
router.get(
  '/operations/resource/:resourceType/:resourceId',
  validateQuery(resourceHistorySchema),
  operationLogController.resourceHistory
);

export default router;
