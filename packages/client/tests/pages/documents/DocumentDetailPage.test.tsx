import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DocumentContentResponse,
  DocumentInfo,
  VersionListResponse,
} from '@knowledge-agent/shared/types';
import { fireClick, flushPromises, render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  useDocument: vi.fn(),
  useDocumentContent: vi.fn(),
  useDocumentVersions: vi.fn(),
  restoreVersion: vi.fn(),
  saveContent: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ id: 'doc-1' }),
  useSearch: () => ({ fromKnowledgeBaseId: 'kb-1' }),
}));

vi.mock('@/hooks', () => ({
  useDocument: mocks.useDocument,
  useDocumentContent: mocks.useDocumentContent,
  useDocumentVersions: mocks.useDocumentVersions,
  useRestoreVersion: () => ({
    mutateAsync: mocks.restoreVersion,
    isPending: false,
  }),
  useSaveDocumentContent: () => ({
    mutateAsync: mocks.saveContent,
    isPending: false,
  }),
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogCancel: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  AlertDialogAction: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/documents', () => ({
  DocumentReader: () => <div data-testid="document-reader" />,
  DocumentInfo: () => <div data-testid="document-info" />,
  AIRewriteDialog: () => null,
}));

vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');
  return {
    ...actual,
    openInNewTab: vi.fn(),
  };
});

import DocumentDetailPage from '@/pages/documents/DocumentDetailPage';

const documentFixture: DocumentInfo = {
  id: 'doc-1',
  userId: 'user-1',
  title: 'Alpha Guide',
  description: null,
  fileName: 'alpha.md',
  mimeType: 'text/markdown',
  fileSize: 128,
  fileExtension: 'md',
  documentType: 'markdown',
  currentVersion: 3,
  processingStatus: 'completed',
  chunkCount: 8,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-02T00:00:00.000Z'),
};

const contentFixture: DocumentContentResponse = {
  id: 'doc-1',
  title: 'Alpha Guide',
  fileName: 'alpha.md',
  documentType: 'markdown',
  textContent: '# Alpha Guide',
  currentVersion: 3,
  processingStatus: 'completed',
  isEditable: false,
  isTruncated: false,
  storageUrl: null,
};

const versionFixture: VersionListResponse = {
  currentVersion: 3,
  versions: [],
};

describe('DocumentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDocument.mockReturnValue({
      data: documentFixture,
      isLoading: false,
      isError: false,
    });
    mocks.useDocumentContent.mockReturnValue({
      data: contentFixture,
      isLoading: false,
      isError: false,
    });
    mocks.useDocumentVersions.mockReturnValue({
      data: versionFixture,
      isLoading: false,
      isError: false,
    });
    mocks.restoreVersion.mockResolvedValue(undefined);
    mocks.saveContent.mockResolvedValue({ document: documentFixture });
  });

  it('should navigate back to the originating knowledge base detail page', async () => {
    const originalHistoryLength = window.history.length;
    Object.defineProperty(window.history, 'length', {
      configurable: true,
      value: 1,
    });

    const view = await render(<DocumentDetailPage />);

    const backButton = view.container.querySelector('button[aria-label="action.backToList"]');
    await fireClick(backButton);
    await flushPromises();

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/knowledge-bases/$id',
      params: { id: 'kb-1' },
    });

    Object.defineProperty(window.history, 'length', {
      configurable: true,
      value: originalHistoryLength,
    });

    await view.unmount();
  });
});
