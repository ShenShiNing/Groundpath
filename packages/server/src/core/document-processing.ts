export interface DocumentProcessingDispatchOptions {
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
    options: DocumentProcessingDispatchOptions
  ): Promise<string>;
}

let dispatcher: DocumentProcessingDispatcher | null = null;

export function registerDocumentProcessingDispatcher(
  nextDispatcher: DocumentProcessingDispatcher
): void {
  dispatcher = nextDispatcher;
}

export function dispatchDocumentProcessing(
  documentId: string,
  userId: string,
  options: DocumentProcessingDispatchOptions
): Promise<string> {
  if (!dispatcher) {
    throw new Error(
      'DocumentProcessingDispatcher not registered. Call registerDocumentProcessingDispatcher at startup.'
    );
  }

  return dispatcher.enqueue(documentId, userId, options);
}

export function resetDocumentProcessingDispatcherForTests(): void {
  dispatcher = null;
}
