// Controllers
export * from './controllers/document.controller';
// Note: upload.controller is not exported here to avoid circular dependency
// (it imports from @modules/user, which imports from @modules/document)

// Services
export * from './services/document.service';
export * from './services/document-trash.service';
export * from './services/document-version.service';
export * from './services/document-storage.service';

// Repositories
export * from './repositories/document.repository';
export * from './repositories/document-chunk.repository';
export * from './repositories/document-version.repository';

// Routes
export { default as documentRoutes } from './document.routes';
