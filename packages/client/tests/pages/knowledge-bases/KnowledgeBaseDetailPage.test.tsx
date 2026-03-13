import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListItem, KnowledgeBaseInfo } from '@knowledge-agent/shared/types';
import { fireClick, fireInput, flushPromises, render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  useKnowledgeBase: vi.fn(),
  useKBDocuments: vi.fn(),
  mutateAsync: vi.fn(),
  invalidateQueries: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  windowOpen: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ id: 'kb-1' }),
  useNavigate: () => mocks.navigate,
  Link: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

vi.mock('@/hooks', () => ({
  useKnowledgeBase: mocks.useKnowledgeBase,
  useKBDocuments: mocks.useKBDocuments,
  useDeleteDocument: () => ({
    mutateAsync: mocks.mutateAsync,
  }),
}));

vi.mock('@/lib/query', () => ({
  queryKeys: {
    knowledgeBases: {
      documents: (id: string, params: unknown) => ['knowledge-bases', id, 'documents', params],
      detail: (id: string) => ['knowledge-bases', id, 'detail'],
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children: React.ReactNode;
    asChild?: boolean;
  }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, props);
    }

    return <button {...props}>{children}</button>;
  },
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-skeleton={className} />,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="alert-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  AlertDialogAction: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableRow: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLTableRowElement> & { children: React.ReactNode }) => (
    <tr {...props}>{children}</tr>
  ),
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
}));

vi.mock('@/components/knowledge-bases', () => ({
  KnowledgeBaseDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="knowledge-base-dialog" /> : null,
  ChatPanel: ({ documents }: { documents: DocumentListItem[] }) => (
    <div data-testid="chat-panel">{documents.length}</div>
  ),
}));

vi.mock('@/components/documents/DocumentUpload', () => ({
  DocumentUpload: ({ onSuccess }: { onSuccess: () => void }) => (
    <div data-testid="document-upload">
      <button type="button" onClick={onSuccess}>
        finish-upload
      </button>
    </div>
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('@/pages/knowledge-bases/DocumentItemViews', () => ({
  DocumentGridCard: ({
    document,
    onSelect,
    onDelete,
  }: {
    document: DocumentListItem;
    onSelect: () => void;
    onDelete: () => void;
  }) => (
    <div>
      <button type="button" onClick={onSelect}>
        grid:{document.title}
      </button>
      <button type="button" aria-label={`delete-${document.id}`} onClick={onDelete}>
        delete-grid
      </button>
    </div>
  ),
  DocumentTableRow: ({
    document,
    onSelect,
    onDelete,
  }: {
    document: DocumentListItem;
    onSelect: () => void;
    onDelete: () => void;
  }) => (
    <tr>
      <td>
        <button type="button" onClick={onSelect}>
          table:{document.title}
        </button>
      </td>
      <td>
        <button type="button" aria-label={`delete-${document.id}`} onClick={onDelete}>
          delete-table
        </button>
      </td>
    </tr>
  ),
}));

import KnowledgeBaseDetailPage from '@/pages/knowledge-bases/KnowledgeBaseDetailPage';

const knowledgeBaseFixture: KnowledgeBaseInfo = {
  id: 'kb-1',
  userId: 'user-1',
  name: 'Knowledge Base Alpha',
  description: null,
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  documentCount: 2,
  totalChunks: 16,
  createdAt: new Date('2026-03-01T00:00:00.000Z'),
  updatedAt: new Date('2026-03-10T00:00:00.000Z'),
};

const documentFixtures: DocumentListItem[] = [
  {
    id: 'doc-1',
    title: 'Alpha Guide',
    description: null,
    fileName: 'alpha.md',
    fileSize: 128,
    fileExtension: 'md',
    documentType: 'markdown',
    processingStatus: 'completed',
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-02T00:00:00.000Z'),
  },
  {
    id: 'doc-2',
    title: 'Beta Manual',
    description: null,
    fileName: 'beta.pdf',
    fileSize: 256,
    fileExtension: 'pdf',
    documentType: 'pdf',
    processingStatus: 'completed',
    createdAt: new Date('2026-03-03T00:00:00.000Z'),
    updatedAt: new Date('2026-03-04T00:00:00.000Z'),
  },
];

describe('KnowledgeBaseDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useKnowledgeBase.mockReturnValue({
      data: knowledgeBaseFixture,
      isLoading: false,
      isError: false,
    });
    mocks.useKBDocuments.mockReturnValue({
      data: {
        documents: documentFixtures,
      },
      isLoading: false,
      isError: false,
    });
    mocks.mutateAsync.mockResolvedValue(undefined);
    mocks.windowOpen.mockReset();
    window.open = mocks.windowOpen as unknown as typeof window.open;
  });

  it('should filter documents, switch to table view, and invalidate after upload success', async () => {
    const view = await render(<KnowledgeBaseDetailPage />);

    expect(view.container.textContent).toContain('Knowledge Base Alpha');
    expect(view.container.textContent).toContain('grid:Alpha Guide');
    expect(view.container.textContent).toContain('grid:Beta Manual');

    const searchInput = view.container.querySelector(
      'input[placeholder="detail.search.placeholder"]'
    ) as HTMLInputElement | null;
    await fireInput(searchInput, 'beta');

    expect(view.container.textContent).not.toContain('grid:Alpha Guide');
    expect(view.container.textContent).toContain('grid:Beta Manual');

    const tableViewButton = view.container.querySelector('button[aria-label="detail.view.table"]');
    await fireClick(tableViewButton);

    expect(view.container.textContent).toContain('table:Beta Manual');
    expect(view.container.textContent).not.toContain('table:Alpha Guide');

    const uploadButton = Array.from(view.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('detail.action.upload')
    );
    await fireClick(uploadButton ?? null);

    const finishUploadButton = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('finish-upload')
    );
    await fireClick(finishUploadButton ?? null);
    await flushPromises();

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['knowledge-bases', 'kb-1', 'documents', {}],
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['knowledge-bases', 'kb-1', 'detail'],
    });

    await view.unmount();
  });

  it('should delete a document and invalidate knowledge base queries', async () => {
    const view = await render(<KnowledgeBaseDetailPage />);

    const deleteButton = view.container.querySelector('button[aria-label="delete-doc-1"]');
    await fireClick(deleteButton);

    const confirmDeleteButton = Array.from(view.container.querySelectorAll('button')).find(
      (button) => button.textContent === 'delete'
    );
    await fireClick(confirmDeleteButton ?? null);
    await flushPromises();

    expect(mocks.mutateAsync).toHaveBeenCalledWith('doc-1');
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['knowledge-bases', 'kb-1', 'documents', {}],
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['knowledge-bases', 'kb-1', 'detail'],
    });

    await view.unmount();
  });
});
