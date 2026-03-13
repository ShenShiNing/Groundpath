import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import './paths';
import { generateDocument } from './registry';

export function setupOpenApi(app: Express) {
  const document = generateDocument();
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: 'Knowledge Agent API',
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );
}
