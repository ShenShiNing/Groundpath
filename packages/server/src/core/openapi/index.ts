import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { BRAND_CONFIG } from '@groundpath/shared/constants';
import { ensureOpenApiRoutesRegistered } from './route-discovery';
import { generateDocument } from './registry';

export function buildOpenApiDocument() {
  ensureOpenApiRoutesRegistered();
  return generateDocument();
}

export function setupOpenApi(app: Express) {
  const document = buildOpenApiDocument();
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: BRAND_CONFIG.openApi.title,
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );
}
