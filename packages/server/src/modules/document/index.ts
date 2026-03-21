// Services (public API)
export { documentService, documentContentService } from './services/document.service';
export { documentStorageService, storageService } from './services/document-storage.service';

// Ports (dependency inversion)
export { registerDocumentProcessingDispatcher } from './ports/document-processing.port';
export type { DocumentProcessingDispatcher } from './ports/document-processing.port';

// Repositories (consumed cross-module)
export { documentRepository } from './repositories/document.repository';
export type { DocumentBackfillCandidate } from './repositories/document.repository';
export { documentChunkRepository } from './repositories/document-chunk.repository';
export { documentVersionRepository } from './repositories/document-version.repository';
