import { useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, File, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useUploadQueue } from '@/hooks';
import { queryKeys } from '@/lib/query';
import { useTranslation } from 'react-i18next';

interface DocumentUploadProps {
  knowledgeBaseId?: string;
  folderId?: string | null;
  onSuccess?: () => void;
  className?: string;
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'text/markdown': ['.md', '.markdown'],
  'text/plain': ['.txt'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const MAX_SIZE = 21 * 1024 * 1024; // 21 MiB (allows files that Windows shows as ~20MB)

export function DocumentUpload({
  knowledgeBaseId,
  folderId,
  onSuccess,
  className,
}: DocumentUploadProps) {
  const { t } = useTranslation('document');
  const queryClient = useQueryClient();
  const queue = useUploadQueue({ maxConcurrent: 3 });
  const clearTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      queue.addFiles(acceptedFiles);
    },
    [queue]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    onDropRejected: (rejections) => {
      rejections.forEach((rejection) => {
        const errors = rejection.errors.map((e) => e.message).join(', ');
        toast.error(t('upload.fileRejected', { name: rejection.file.name, errors }));
      });
    },
  });

  const handleUpload = () => {
    queue.startUpload({
      knowledgeBaseId: knowledgeBaseId ?? undefined,
      folderId: folderId ?? undefined,
      onFileComplete: (_, file) => {
        toast.success(t('upload.fileUploaded', { name: file.name }));
      },
      onAllComplete: (hasErrors) => {
        // Invalidate document queries to refresh the list
        queryClient.invalidateQueries({ queryKey: queryKeys.documents.lists() });
        if (knowledgeBaseId) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.knowledgeBases.documents(knowledgeBaseId, {}),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.knowledgeBases.detail(knowledgeBaseId),
          });
        }

        if (!hasErrors) {
          // Clear completed files after a delay and close dialog
          clearTimerRef.current = setTimeout(() => {
            queue.clearCompleted();
            onSuccess?.();
          }, 1500);
        }
      },
    });
  };

  const { files, isUploading, totalProgress, stats } = queue;
  const hasFilesToUpload = stats.pending > 0 || stats.error > 0;

  return (
    <div className={cn('space-y-4', className)}>
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        {isDragActive ? (
          <p className="text-primary">{t('upload.dropHere')}</p>
        ) : (
          <>
            <p className="text-muted-foreground mb-2">{t('upload.dragAndDrop')}</p>
            <p className="text-xs text-muted-foreground">{t('upload.supportedTypes')}</p>
          </>
        )}
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">
            {t('upload.fileCount', { count: files.length })}
            {isUploading && (
              <span className="text-muted-foreground">
                {' '}
                -{' '}
                {t('upload.uploadingProgress', {
                  current: stats.uploading,
                  total: stats.uploading + stats.pending,
                  progress: totalProgress,
                })}
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {files.map((fileState) => (
              <div
                key={fileState.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-md border transition-colors',
                  fileState.status === 'completed' &&
                    'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800',
                  fileState.status === 'error' &&
                    'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
                  fileState.status === 'uploading' &&
                    'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
                  fileState.status === 'pending' && 'bg-muted/50'
                )}
              >
                {fileState.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                ) : fileState.status === 'uploading' ? (
                  <Loader2 className="h-4 w-4 text-blue-600 animate-spin shrink-0" />
                ) : fileState.status === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                ) : (
                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{fileState.file.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(fileState.file.size)}
                    </p>
                    {fileState.status === 'uploading' && (
                      <span className="text-xs text-blue-600">{fileState.progress}%</span>
                    )}
                    {fileState.status === 'completed' && (
                      <span className="text-xs text-green-600">{t('upload.complete')}</span>
                    )}
                    {fileState.status === 'error' && (
                      <span className="text-xs text-red-600">
                        {fileState.error || t('upload.error')}
                      </span>
                    )}
                  </div>
                  {fileState.status === 'uploading' && (
                    <Progress value={fileState.progress} className="h-1 mt-1" />
                  )}
                </div>
                {(fileState.status === 'pending' || fileState.status === 'error') && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => queue.removeFile(fileState.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {isUploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('upload.overallProgress')}</span>
                <span>{totalProgress}%</span>
              </div>
              <Progress value={totalProgress} className="h-2" />
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={isUploading || !hasFilesToUpload}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('upload.uploading')}
              </>
            ) : stats.error > 0 ? (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {t('upload.retryFailed', { count: stats.error })}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {t('upload.uploadFiles', { count: stats.pending })}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
