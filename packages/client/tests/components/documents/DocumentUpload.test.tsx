import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query/keys';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { fireClick, render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  queue: {
    files: [] as Array<{
      id: string;
      file: File;
      progress: number;
      status: 'pending' | 'uploading' | 'completed' | 'error';
      error?: string;
    }>,
    isUploading: false,
    totalProgress: 0,
    stats: {
      pending: 0,
      uploading: 0,
      completed: 0,
      error: 0,
    },
    addFiles: vi.fn(),
    removeFile: vi.fn(),
    startUpload: vi.fn(),
    clearCompleted: vi.fn(),
    clear: vi.fn(),
  },
  invalidateQueries: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  dropzoneOptions: null as null | {
    onDropRejected?: (
      rejections: Array<{
        file: File;
        errors: Array<{ message: string }>;
      }>
    ) => void;
  },
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  };
});

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mocks.invalidateQueries,
    }),
  };
});

vi.mock('@/hooks', () => ({
  useUploadQueue: () => mocks.queue,
}));

vi.mock('react-dropzone', () => ({
  useDropzone: (options: typeof mocks.dropzoneOptions) => {
    mocks.dropzoneOptions = options;
    return {
      getRootProps: () => ({ 'data-testid': 'dropzone-root' }),
      getInputProps: () => ({ 'data-testid': 'dropzone-input' }),
      isDragActive: false,
    };
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/progress', () => ({
  Progress: ({ value }: { value?: number }) => <div data-progress={value ?? 0} />,
}));

function resetQueueState() {
  mocks.queue.files = [];
  mocks.queue.isUploading = false;
  mocks.queue.totalProgress = 0;
  mocks.queue.stats = {
    pending: 0,
    uploading: 0,
    completed: 0,
    error: 0,
  };
}

describe('DocumentUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetQueueState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should invalidate document queries and clear completed uploads after a successful batch', async () => {
    const pendingFile = new File(['pdf'], 'report.pdf', { type: 'application/pdf' });
    mocks.queue.files = [
      {
        id: 'upload-1',
        file: pendingFile,
        progress: 0,
        status: 'pending',
      },
    ];
    mocks.queue.stats = {
      pending: 1,
      uploading: 0,
      completed: 0,
      error: 0,
    };

    const onSuccess = vi.fn();
    const view = await render(<DocumentUpload knowledgeBaseId="kb-1" onSuccess={onSuccess} />);

    const submitButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('upload.uploadFiles')
    );

    await fireClick(submitButton ?? null);

    const uploadOptions = mocks.queue.startUpload.mock.calls[0]?.[0];
    expect(uploadOptions?.knowledgeBaseId).toBe('kb-1');

    uploadOptions?.onFileComplete?.('upload-1', pendingFile);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('upload.fileUploaded');

    uploadOptions?.onAllComplete?.(false);

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.documents.lists(),
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.knowledgeBases.documents('kb-1', {}),
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.knowledgeBases.detail('kb-1'),
    });

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(mocks.queue.clearCompleted).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    await view.unmount();
  });

  it('should keep failed uploads visible after batch completion', async () => {
    const erroredFile = new File(['doc'], 'failed.md', { type: 'text/markdown' });
    mocks.queue.files = [
      {
        id: 'upload-2',
        file: erroredFile,
        progress: 0,
        status: 'error',
        error: 'Upload failed',
      },
    ];
    mocks.queue.stats = {
      pending: 0,
      uploading: 0,
      completed: 0,
      error: 1,
    };

    const onSuccess = vi.fn();
    const view = await render(<DocumentUpload onSuccess={onSuccess} />);

    const retryButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('upload.retryFailed')
    );

    await fireClick(retryButton ?? null);

    const uploadOptions = mocks.queue.startUpload.mock.calls[0]?.[0];
    uploadOptions?.onAllComplete?.(true);

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.documents.lists(),
    });
    expect(mocks.queue.clearCompleted).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();

    await view.unmount();
  });

  it('should surface rejected files through toast errors', async () => {
    await render(<DocumentUpload />);

    mocks.dropzoneOptions?.onDropRejected?.([
      {
        file: new File(['bad'], 'oversize.pdf', { type: 'application/pdf' }),
        errors: [{ message: 'File is larger than 21 MiB' }],
      },
    ]);

    expect(mocks.toastError).toHaveBeenCalledWith('upload.fileRejected');
  });
});
