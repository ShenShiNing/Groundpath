// Services (public API)
export { documentService, documentContentService } from './services/document.service';
export { documentTrashService } from './services/document-trash.service';
export { documentVersionService } from './services/document-version.service';
export { documentStorageService, storageService } from './services/document-storage.service';

// Repositories (consumed cross-module)
export { documentRepository } from './repositories/document.repository';
export type { DocumentBackfillCandidate } from './repositories/document.repository';
export { documentChunkRepository } from './repositories/document-chunk.repository';
export { documentVersionRepository } from './repositories/document-version.repository';
