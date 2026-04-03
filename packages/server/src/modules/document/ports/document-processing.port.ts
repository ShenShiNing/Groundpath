/**
 * Compatibility shim for the document-processing contract.
 *
 * New shared consumers should import from @core/document-processing.
 */
export {
  DOCUMENT_PROCESSING_REASONS,
  dispatchDocumentProcessing,
  emitDocumentProcessingSettled,
  emitDocumentProcessingStarted,
  registerDocumentProcessingLifecycleListener,
  registerDocumentProcessingDispatcher,
  resetDocumentProcessingDispatcherForTests,
  resetDocumentProcessingLifecycleListenersForTests,
  type DocumentProcessingLifecycleEvent,
  type DocumentProcessingLifecycleListener,
  type DocumentProcessingReason,
  type DocumentProcessingDispatcher,
  type DocumentProcessingDispatchOptions as DocumentProcessingEnqueueOptions,
} from '@core/document-processing';
