import { processDocument } from './processing.executor';
import { acquireProcessingLock, releaseProcessingLock } from './processing.lock';
import { isStaleTargetVersion, resetToPending, safeDeleteVectors } from './processing.stages';

export type { DocumentProcessingResult } from './processing.types';

export const processingService = {
  acquireProcessingLock,
  releaseProcessingLock,
  resetToPending,
  isStaleTargetVersion,
  processDocument,
  safeDeleteVectors,
};
