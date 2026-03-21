import path from 'path';
import express from 'express';
import { serverConfig, storageConfig } from '@config/env';
import { apiRouteModules } from './api-route-modules';

const router = express.Router();

// Serve local uploads when using local storage with signing disabled (dev only)
const storageType = storageConfig.type || (serverConfig.nodeEnv === 'production' ? 'r2' : 'local');
if (
  storageType === 'local' &&
  serverConfig.nodeEnv === 'development' &&
  storageConfig.signing.disabled
) {
  router.use('/api/uploads', express.static(path.resolve(storageConfig.localPath)));
}

// Business routes must be mounted through src/api-route-modules.ts
// so the OpenAPI document can auto-discover them from the live router tree.
for (const routeModule of apiRouteModules) {
  router.use(routeModule.basePath, routeModule.router);
}

// 404 handler for undefined routes (must be last)
router.use('/api/{*path}', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      requestId: req.requestId,
    },
  });
});

export default router;
