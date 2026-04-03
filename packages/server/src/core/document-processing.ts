export const DOCUMENT_PROCESSING_REASONS = [
  'upload',
  'edit',
  'restore',
  'retry',
  'backfill',
  'recovery',
] as const;

export type DocumentProcessingReason = (typeof DOCUMENT_PROCESSING_REASONS)[number];

export interface DocumentProcessingDispatchOptions {
  targetDocumentVersion: number;
  targetIndexVersion?: string;
  reason: DocumentProcessingReason;
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

export interface DocumentProcessingLifecycleEvent extends DocumentProcessingDispatchOptions {
  documentId: string;
  userId: string;
  jobId?: string;
  attempt?: number;
  outcome?: 'completed' | 'skipped' | 'failed';
  error?: string;
}

export interface DocumentProcessingLifecycleListener {
  onStarted?(event: DocumentProcessingLifecycleEvent): Promise<void> | void;
  onSettled?(event: DocumentProcessingLifecycleEvent): Promise<void> | void;
}

let dispatcher: DocumentProcessingDispatcher | null = null;
const lifecycleListeners = new Set<DocumentProcessingLifecycleListener>();

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

export function registerDocumentProcessingLifecycleListener(
  listener: DocumentProcessingLifecycleListener
): void {
  lifecycleListeners.add(listener);
}

async function notifyLifecycleListeners(
  method: keyof DocumentProcessingLifecycleListener,
  event: DocumentProcessingLifecycleEvent
): Promise<void> {
  if (lifecycleListeners.size === 0) {
    return;
  }

  const settledResults = await Promise.allSettled(
    [...lifecycleListeners].map((listener) => Promise.resolve(listener[method]?.(event)))
  );
  const errors = settledResults
    .filter(
      (result): result is PromiseRejectedResult =>
        result.status === 'rejected' && result.reason !== undefined
    )
    .map((result) => result.reason);

  if (errors.length === 0) {
    return;
  }

  if (errors.length === 1) {
    throw errors[0];
  }

  throw new AggregateError(
    errors,
    `Document processing lifecycle listener failures during ${method}`
  );
}

export async function emitDocumentProcessingStarted(
  event: DocumentProcessingLifecycleEvent
): Promise<void> {
  await notifyLifecycleListeners('onStarted', event);
}

export async function emitDocumentProcessingSettled(
  event: DocumentProcessingLifecycleEvent
): Promise<void> {
  await notifyLifecycleListeners('onSettled', event);
}

export function resetDocumentProcessingDispatcherForTests(): void {
  dispatcher = null;
}

export function resetDocumentProcessingLifecycleListenersForTests(): void {
  lifecycleListeners.clear();
}
