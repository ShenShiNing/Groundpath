/**
 * Port for dispatching document processing jobs.
 *
 * The document module owns the orchestration (upload/restore/edit → enqueue),
 * but does NOT depend on the RAG module's queue implementation.
 * The concrete dispatcher is registered at the composition root.
 */

export interface DocumentProcessingEnqueueOptions {
  targetDocumentVersion: number;
  targetIndexVersion?: string;
  reason: string;
  backfillRunId?: string;
  jobIdSuffix?: string;
}

export interface DocumentProcessingDispatcher {
  enqueue(
    documentId: string,
    userId: string,
    options: DocumentProcessingEnqueueOptions
  ): Promise<string>;
}

let dispatcher: DocumentProcessingDispatcher | null = null;

export function registerDocumentProcessingDispatcher(d: DocumentProcessingDispatcher): void {
  dispatcher = d;
}

export function dispatchDocumentProcessing(
  documentId: string,
  userId: string,
  options: DocumentProcessingEnqueueOptions
): Promise<string> {
  if (!dispatcher) {
    throw new Error(
      'DocumentProcessingDispatcher not registered. Call registerDocumentProcessingDispatcher at startup.'
    );
  }
  return dispatcher.enqueue(documentId, userId, options);
}
