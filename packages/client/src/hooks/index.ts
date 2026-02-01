// Document hooks
export {
  useDocuments,
  useDocument,
  useDocumentVersions,
  useTrashDocuments,
  useUploadDocument,
  useUpdateDocument,
  useDeleteDocument,
  useRestoreDocument,
  usePermanentDeleteDocument,
  useUploadNewVersion,
  useRestoreVersion,
} from './useDocuments';

// Folder hooks
export {
  useFolders,
  useFolderTree,
  useFolder,
  useFolderChildren,
  useCreateFolder,
  useUpdateFolder,
  useDeleteFolder,
} from './useFolders';

// Knowledge Base hooks
export {
  useKnowledgeBases,
  useKnowledgeBase,
  useKBDocuments,
  useKBFolders,
  useKBFolderTree,
  useKBDocumentTree,
  useCreateKnowledgeBase,
  useUpdateKnowledgeBase,
  useDeleteKnowledgeBase,
  useUploadToKB,
  useCreateFolderInKB,
  useDeleteDocuments,
  useMoveDocuments,
  type DocumentTreeNode,
} from './useKnowledgeBases';

// Utility hooks
export { useDebouncedValue } from './useDebouncedValue';

// Upload hooks
export { useUploadQueue } from './useUploadQueue';
export type { QueueFileState, UploadQueueStats, StartUploadOptions } from './useUploadQueue';
