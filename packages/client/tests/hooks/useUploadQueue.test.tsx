import React, { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { flushPromises, render } from '../utils/render';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  uploadDocument: vi.fn(),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    documentsApi: {
      ...actual.documentsApi,
      upload: mocks.upload,
    },
    knowledgeBasesApi: {
      ...actual.knowledgeBasesApi,
      uploadDocument: mocks.uploadDocument,
    },
  };
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await flushPromises();
    if (condition()) {
      return;
    }
  }

  throw new Error('Condition was not met');
}

function getFileState(queue: ReturnType<typeof useUploadQueue> | undefined, name: string) {
  return queue?.files.find((file) => file.file.name === name);
}

function UploadQueueProbe({
  onReady,
  maxConcurrent = 3,
}: {
  onReady: (queue: ReturnType<typeof useUploadQueue>) => void;
  maxConcurrent?: number;
}) {
  const queue = useUploadQueue({ maxConcurrent });

  React.useEffect(() => {
    onReady(queue);
  }, [onReady, queue]);

  return null;
}

describe('useUploadQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should keep batch error state when a later upload fails after the first file succeeds', async () => {
    const firstUpload = createDeferred<{ document: object; message: string }>();
    const secondUpload = createDeferred<{ document: object; message: string }>();
    mocks.uploadDocument
      .mockReturnValueOnce(firstUpload.promise)
      .mockReturnValueOnce(secondUpload.promise);

    const queueRef: { current?: ReturnType<typeof useUploadQueue> } = {};
    const onAllComplete = vi.fn();
    const view = await render(
      <UploadQueueProbe
        maxConcurrent={2}
        onReady={(queue) => {
          queueRef.current = queue;
        }}
      />
    );

    await waitFor(() => queueRef.current !== undefined);

    const firstFile = new File(['first'], 'first.md', { type: 'text/markdown' });
    const secondFile = new File(['second'], 'second.md', { type: 'text/markdown' });

    await act(async () => {
      queueRef.current?.addFiles([firstFile, secondFile]);
    });
    await waitFor(() => queueRef.current?.stats.pending === 2);

    await act(async () => {
      queueRef.current?.startUpload({
        knowledgeBaseId: 'kb-1',
        onAllComplete,
      });
    });
    await waitFor(() => mocks.uploadDocument.mock.calls.length === 2);

    await act(async () => {
      firstUpload.resolve({ document: {}, message: 'ok' });
      secondUpload.reject(new Error('Second failed'));
      await Promise.resolve();
    });

    await waitFor(() => queueRef.current?.isUploading === false);
    expect(getFileState(queueRef.current, 'first.md')?.status).toBe('completed');
    expect(getFileState(queueRef.current, 'second.md')?.status).toBe('error');
    expect(getFileState(queueRef.current, 'second.md')?.error).toBe('Second failed');
    expect(onAllComplete).toHaveBeenCalledWith(true);

    await view.unmount();
  });

  it('should retry failed files when restarting a batch with only error items', async () => {
    mocks.uploadDocument
      .mockRejectedValueOnce(new Error('Upload failed'))
      .mockResolvedValueOnce({ document: {}, message: 'ok' });

    const queueRef: { current?: ReturnType<typeof useUploadQueue> } = {};
    const view = await render(
      <UploadQueueProbe
        maxConcurrent={1}
        onReady={(queue) => {
          queueRef.current = queue;
        }}
      />
    );

    await waitFor(() => queueRef.current !== undefined);

    const file = new File(['retry'], 'retry.md', { type: 'text/markdown' });

    await act(async () => {
      queueRef.current?.addFiles([file]);
    });
    await waitFor(() => queueRef.current?.stats.pending === 1);

    await act(async () => {
      queueRef.current?.startUpload({ knowledgeBaseId: 'kb-1' });
    });

    await waitFor(() => getFileState(queueRef.current, 'retry.md')?.status === 'error');

    await act(async () => {
      queueRef.current?.startUpload({ knowledgeBaseId: 'kb-1' });
    });

    await waitFor(() => mocks.uploadDocument.mock.calls.length === 2);
    await waitFor(() => getFileState(queueRef.current, 'retry.md')?.status === 'completed');

    await view.unmount();
  });

  it('should requeue failed files before uploading newly added files', async () => {
    mocks.uploadDocument
      .mockRejectedValueOnce(new Error('First failed'))
      .mockResolvedValueOnce({ document: {}, message: 'ok' })
      .mockResolvedValueOnce({ document: {}, message: 'ok' });

    const queueRef: { current?: ReturnType<typeof useUploadQueue> } = {};
    const view = await render(
      <UploadQueueProbe
        maxConcurrent={2}
        onReady={(queue) => {
          queueRef.current = queue;
        }}
      />
    );

    await waitFor(() => queueRef.current !== undefined);

    const firstFile = new File(['first'], 'first.md', { type: 'text/markdown' });
    const secondFile = new File(['second'], 'second.md', { type: 'text/markdown' });

    await act(async () => {
      queueRef.current?.addFiles([firstFile]);
    });
    await waitFor(() => queueRef.current?.stats.pending === 1);

    await act(async () => {
      queueRef.current?.startUpload({ knowledgeBaseId: 'kb-1' });
    });

    await waitFor(() => getFileState(queueRef.current, 'first.md')?.status === 'error');

    await act(async () => {
      queueRef.current?.addFiles([secondFile]);
    });
    await waitFor(() => queueRef.current?.stats.pending === 1);

    await act(async () => {
      queueRef.current?.startUpload({ knowledgeBaseId: 'kb-1' });
    });

    await waitFor(() => mocks.uploadDocument.mock.calls.length === 3);
    await waitFor(() => getFileState(queueRef.current, 'first.md')?.status === 'completed');
    await waitFor(() => getFileState(queueRef.current, 'second.md')?.status === 'completed');

    await view.unmount();
  });
});
