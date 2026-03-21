import { loginLogController } from './controllers/login-log.controller';
import { operationLogController } from './controllers/operation-log.controller';
import { structuredRagDashboardController } from './controllers/structured-rag-dashboard.controller';
import { structuredRagReportController } from './controllers/structured-rag-report.controller';

export const logsRouteHandlers = {
  loginLogController,
  operationLogController,
  structuredRagDashboardController,
  structuredRagReportController,
};
