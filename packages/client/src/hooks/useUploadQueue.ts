import { useCallback, useRef, useState } from 'react';
import { documentsApi, knowledgeBasesApi } from '@/api';

export interface QueueFileState {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export interface UploadQueueStats {
  pending: number;
  uploading: number;
  completed: number;
  error: number;
}

export interface StartUploadOptions {
  knowledgeBaseId?: string;
  title?: string;
  description?: string;
  onFileComplete?: (fileId: string, file: File) => void;
  onAllComplete?: (hasErrors: boolean) => void;
}

interface UseUploadQueueOptions {
  maxConcurrent?: number;
}

let fileIdCounter = 0;

export function useUploadQueue({ maxConcurrent = 3 }: UseUploadQueueOptions = {}) {
  const [files, setFiles] = useState<QueueFileState[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Refs to avoid stale closures during async operations
  const filesRef = useRef<QueueFileState[]>([]);
  const activeCountRef = useRef(0);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const uploadOptionsRef = useRef<StartUploadOptions>({});

  // Sync state to ref
  const updateFilesState = useCallback((updater: (prev: QueueFileState[]) => QueueFileState[]) => {
    setFiles((prev) => {
      const next = updater(prev);
      filesRef.current = next;
      return next;
    });
  }, []);

  const updateFileById = useCallback(
    (fileId: string, updates: Partial<QueueFileState>) => {
      updateFilesState((prev) => prev.map((f) => (f.id === fileId ? { ...f, ...updates } : f)));
    },
    [updateFilesState]
  );

  const processNext = useCallback(() => {
    if (activeCountRef.current >= maxConcurrent) return;

    const nextFile = filesRef.current.find((f) => f.status === 'pending');
    if (!nextFile) {
      // No more pending files - check if all done
      if (activeCountRef.current === 0) {
        setIsUploading(false);
        const hasErrors = filesRef.current.some((f) => f.status === 'error');
        uploadOptionsRef.current.onAllComplete?.(hasErrors);
      }
      return;
    }

    activeCountRef.current++;
    const abortController = new AbortController();
    abortControllersRef.current.set(nextFile.id, abortController);

    // Synchronously update filesRef to prevent duplicate processing
    // (React's setState is async, so filesRef wouldn't update in time for concurrent processNext calls)
    filesRef.current = filesRef.current.map((f) =>
      f.id === nextFile.id
        ? { ...f, status: 'uploading' as const, progress: 0, error: undefined }
        : f
    );
    updateFileById(nextFile.id, { status: 'uploading', progress: 0, error: undefined });

    // Build FormData in hooks layer
    const formData = new FormData();
    formData.append('file', nextFile.file);
    const opts = uploadOptionsRef.current;
    if (opts.title) formData.append('title', opts.title);
    if (opts.description) formData.append('description', opts.description);

    // Use KB-specific API when knowledgeBaseId is provided, otherwise use documents API
    const uploadPromise = opts.knowledgeBaseId
      ? knowledgeBasesApi.uploadDocument(opts.knowledgeBaseId, formData, {
          onUploadProgress: (loaded, total) => {
            const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
            updateFileById(nextFile.id, { progress });
          },
          signal: abortController.signal,
        })
      : documentsApi.upload(formData, {
          onUploadProgress: (loaded, total) => {
            const progress = total > 0 ? Math.round((loaded / total) * 100) : 0;
            updateFileById(nextFile.id, { progress });
          },
          signal: abortController.signal,
        });

    uploadPromise
      .then(() => {
        updateFileById(nextFile.id, { status: 'completed', progress: 100 });
        uploadOptionsRef.current.onFileComplete?.(nextFile.id, nextFile.file);
      })
      .catch((error) => {
        // Don't mark as error if aborted
        if (error?.name === 'AbortError' || error?.name === 'CanceledError') {
          return;
        }
        updateFileById(nextFile.id, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      })
      .finally(() => {
        activeCountRef.current--;
        abortControllersRef.current.delete(nextFile.id);
        processNext();
      });

    // Try to fill remaining slots
    processNext();
  }, [maxConcurrent, updateFileById]);

  const addFiles = useCallback(
    (newFiles: File[]) => {
      const newFileStates: QueueFileState[] = newFiles.map((file) => ({
        id: `upload-${++fileIdCounter}`,
        file,
        progress: 0,
        status: 'pending' as const,
      }));
      updateFilesState((prev) => [...prev, ...newFileStates]);
    },
    [updateFilesState]
  );

  const removeFile = useCallback(
    (fileId: string) => {
      // Cancel upload if in progress
      const controller = abortControllersRef.current.get(fileId);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(fileId);
        activeCountRef.current--;
      }
      updateFilesState((prev) => prev.filter((f) => f.id !== fileId));
    },
    [updateFilesState]
  );

  const startUpload = useCallback(
    (options: StartUploadOptions = {}) => {
      const filesToUpload = filesRef.current.filter(
        (f) => f.status === 'pending' || f.status === 'error'
      );
      if (filesToUpload.length === 0) return;

      // Reset error files to pending
      updateFilesState((prev) =>
        prev.map((f) => (f.status === 'error' ? { ...f, status: 'pending' as const } : f))
      );

      uploadOptionsRef.current = options;
      setIsUploading(true);

      // Start processing (will fill up to maxConcurrent slots)
      for (let i = 0; i < maxConcurrent; i++) {
        processNext();
      }
    },
    [maxConcurrent, processNext, updateFilesState]
  );

  const clearCompleted = useCallback(() => {
    updateFilesState((prev) => prev.filter((f) => f.status !== 'completed'));
  }, [updateFilesState]);

  const clear = useCallback(() => {
    // Cancel all active uploads
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
    activeCountRef.current = 0;
    setIsUploading(false);
    updateFilesState(() => []);
  }, [updateFilesState]);

  // Computed values
  const totalProgress =
    files.length > 0 ? Math.round(files.reduce((acc, f) => acc + f.progress, 0) / files.length) : 0;

  const stats: UploadQueueStats = {
    pending: files.filter((f) => f.status === 'pending').length,
    uploading: files.filter((f) => f.status === 'uploading').length,
    completed: files.filter((f) => f.status === 'completed').length,
    error: files.filter((f) => f.status === 'error').length,
  };

  return {
    files,
    isUploading,
    totalProgress,
    stats,
    addFiles,
    removeFile,
    startUpload,
    clearCompleted,
    clear,
  };
}
