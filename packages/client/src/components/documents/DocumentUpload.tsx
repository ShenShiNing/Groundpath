import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useUploadDocument } from '@/hooks';

interface DocumentUploadProps {
  folderId?: string | null;
  onSuccess?: () => void;
  className?: string;
}

interface FileUploadState {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'text/markdown': ['.md', '.markdown'],
  'text/plain': ['.txt'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export function DocumentUpload({ folderId, onSuccess, className }: DocumentUploadProps) {
  const uploadMutation = useUploadDocument();
  const [fileStates, setFileStates] = useState<FileUploadState[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFileStates = acceptedFiles.map((file) => ({
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setFileStates((prev) => [...prev, ...newFileStates]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    onDropRejected: (rejections) => {
      rejections.forEach((rejection) => {
        const errors = rejection.errors.map((e) => e.message).join(', ');
        toast.error(`File rejected: ${rejection.file.name} - ${errors}`);
      });
    },
  });

  const removeFile = (index: number) => {
    setFileStates((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFileState = (index: number, updates: Partial<FileUploadState>) => {
    setFileStates((prev) =>
      prev.map((state, i) => (i === index ? { ...state, ...updates } : state))
    );
  };

  const handleUpload = async () => {
    const filesToUpload = fileStates.filter((f) => f.status === 'pending' || f.status === 'error');
    if (filesToUpload.length === 0) return;

    setIsUploading(true);

    let hasError = false;

    for (let i = 0; i < fileStates.length; i++) {
      const fileState = fileStates[i];
      if (fileState?.status !== 'pending' && fileState?.status !== 'error') continue;

      updateFileState(i, { status: 'uploading', progress: 0, error: undefined });

      try {
        await uploadMutation.mutateAsync({
          file: fileState.file,
          options: {
            folderId: folderId ?? undefined,
            onProgress: (progress) => {
              updateFileState(i, { progress });
            },
          },
        });
        updateFileState(i, { status: 'completed', progress: 100 });
        toast.success(`Uploaded: ${fileState.file.name}`);
      } catch (error) {
        hasError = true;
        updateFileState(i, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed',
        });
        toast.error(`Failed to upload: ${fileState.file.name}`);
      }
    }

    setIsUploading(false);

    // Only close dialog if all uploads succeeded
    if (!hasError) {
      // Clear completed files after a delay
      setTimeout(() => {
        setFileStates((prev) => prev.filter((f) => f.status !== 'completed'));
        onSuccess?.();
      }, 1500);
    }
  };

  const totalProgress =
    fileStates.length > 0
      ? Math.round(fileStates.reduce((acc, f) => acc + f.progress, 0) / fileStates.length)
      : 0;

  const pendingCount = fileStates.filter((f) => f.status === 'pending').length;
  const errorCount = fileStates.filter((f) => f.status === 'error').length;
  const hasFilesToUpload = pendingCount > 0 || errorCount > 0;

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
          <p className="text-primary">Drop files here...</p>
        ) : (
          <>
            <p className="text-muted-foreground mb-2">Drag & drop files here, or click to select</p>
            <p className="text-xs text-muted-foreground">
              Supported: PDF, Markdown, Text, DOCX (max 20MB)
            </p>
          </>
        )}
      </div>

      {fileStates.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">
            Files ({fileStates.length}){isUploading && ` - Uploading ${totalProgress}%`}
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {fileStates.map((fileState, index) => (
              <div
                key={`${fileState.file.name}-${index}`}
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
                      <span className="text-xs text-green-600">Complete</span>
                    )}
                    {fileState.status === 'error' && (
                      <span className="text-xs text-red-600">{fileState.error || 'Error'}</span>
                    )}
                  </div>
                  {fileState.status === 'uploading' && (
                    <Progress value={fileState.progress} className="h-1 mt-1" />
                  )}
                </div>
                {fileState.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeFile(index)}
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
                <span>Overall progress</span>
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
                Uploading...
              </>
            ) : errorCount > 0 ? (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Retry {errorCount} failed file{errorCount !== 1 ? 's' : ''}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload {pendingCount} file{pendingCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
