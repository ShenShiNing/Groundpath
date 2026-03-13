import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
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
      customSiteTitle: 'Knowledge Agent API',
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );
}
