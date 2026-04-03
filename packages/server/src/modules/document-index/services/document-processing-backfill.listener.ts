import type { DocumentProcessingLifecycleListener } from '@core/document-processing';
import { documentIndexBackfillProgressService } from './document-index-backfill-progress.service';

export const documentProcessingBackfillLifecycleListener: DocumentProcessingLifecycleListener = {
  async onStarted(event) {
    if (event.reason !== 'backfill' || !event.backfillRunId) {
      return;
    }

    await documentIndexBackfillProgressService.markProcessing({
      runId: event.backfillRunId,
      documentId: event.documentId,
      jobId: event.jobId,
    });
  },

  async onSettled(event) {
    if (event.reason !== 'backfill' || !event.backfillRunId || !event.outcome) {
      return;
    }

    await documentIndexBackfillProgressService.recordOutcome({
      runId: event.backfillRunId,
      documentId: event.documentId,
      outcome: event.outcome,
      error: event.error,
    });
  },
};
