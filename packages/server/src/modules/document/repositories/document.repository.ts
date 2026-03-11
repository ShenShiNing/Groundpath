import { documentRepositoryBackfill } from './document.repository.backfill';
import { documentRepositoryCore } from './document.repository.core';
import { documentRepositoryProcessing } from './document.repository.processing';
import { documentRepositoryQueries } from './document.repository.queries';

export type {
  DocumentBackfillCandidate,
  StaleProcessingDocument,
} from './document.repository.types';

export const documentRepository = {
  ...documentRepositoryCore,
  ...documentRepositoryProcessing,
  ...documentRepositoryQueries,
  ...documentRepositoryBackfill,
};
