/**
 * Compatibility shim for the document-processing contract.
 *
 * New shared consumers should import from @core/document-processing.
 */
export {
  dispatchDocumentProcessing,
  registerDocumentProcessingDispatcher,
  resetDocumentProcessingDispatcherForTests,
  type DocumentProcessingDispatcher,
  type DocumentProcessingDispatchOptions as DocumentProcessingEnqueueOptions,
} from '@core/document-processing';
