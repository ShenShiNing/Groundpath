import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { KnowledgeBaseDialog } from '@/components/knowledge-bases';
import { useDeleteDocument, useKBDocuments, useKnowledgeBase } from '@/hooks';
import { openInNewTab } from '@/lib/utils';
import { queryKeys } from '@/lib/query';
import type { DocumentListItem } from '@groundpath/shared/types';
import { KnowledgeBaseDeleteDialog } from './knowledge-base-detail/KnowledgeBaseDeleteDialog';
import { KnowledgeBaseDetailErrorState } from './knowledge-base-detail/KnowledgeBaseDetailStates';
import { KnowledgeBaseDetailHeader } from './knowledge-base-detail/KnowledgeBaseDetailHeader';
import { KnowledgeBaseDetailLoadingState } from './knowledge-base-detail/KnowledgeBaseDetailStates';
import { KnowledgeBaseDetailMissingIdState } from './knowledge-base-detail/KnowledgeBaseDetailStates';
import { KnowledgeBaseDetailNotFoundState } from './knowledge-base-detail/KnowledgeBaseDetailStates';
import { KnowledgeBaseDocumentsContent } from './knowledge-base-detail/KnowledgeBaseDocumentsContent';
import { KnowledgeBaseDocumentsToolbar } from './knowledge-base-detail/KnowledgeBaseDocumentsToolbar';
import { KnowledgeBaseUploadDialog } from './knowledge-base-detail/KnowledgeBaseUploadDialog';
import type { DeleteDialogState, ViewMode } from './knowledge-base-detail/types';

export default function KnowledgeBaseDetailPage() {
  const { t } = useTranslation(['knowledgeBase', 'common']);
  const { id } = useParams({ strict: false });
  const knowledgeBaseId = typeof id === 'string' ? id : undefined;
  const safeKnowledgeBaseId = knowledgeBaseId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    documents: [],
  });

  const {
    data: knowledgeBase,
    isLoading: kbLoading,
    isError: kbError,
  } = useKnowledgeBase(knowledgeBaseId);
  const {
    data: documentsResponse,
    isLoading: docsLoading,
    isError: docsError,
  } = useKBDocuments(knowledgeBaseId, {
    pageSize: 100,
  });
  const deleteDocumentMutation = useDeleteDocument();

  useEffect(() => {
    if (docsError) {
      toast.error(t('detail.error.loadFailed'));
    }
  }, [docsError, t]);

  const documents = useMemo(() => documentsResponse?.documents ?? [], [documentsResponse]);

  const filteredDocuments = useMemo(() => {
    if (!search) {
      return documents;
    }

    const normalizedSearch = search.toLowerCase();
    return documents.filter((document) => document.title.toLowerCase().includes(normalizedSearch));
  }, [documents, search]);

  const invalidateKnowledgeBaseQueries = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.knowledgeBases.documents(safeKnowledgeBaseId, {}),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.knowledgeBases.detail(safeKnowledgeBaseId),
    });
  }, [queryClient, safeKnowledgeBaseId]);

  const handleUploadSuccess = useCallback(() => {
    setUploadOpen(false);
    invalidateKnowledgeBaseQueries();
  }, [invalidateKnowledgeBaseQueries]);

  const handleDocumentClick = useCallback(
    (document: DocumentListItem) => {
      void navigate({
        to: '/documents/$id',
        params: { id: document.id },
        search: { fromKnowledgeBaseId: knowledgeBaseId },
      });
    },
    [knowledgeBaseId, navigate]
  );

  const handleDeleteDocument = useCallback((document: DocumentListItem) => {
    setDeleteDialog({ open: true, documents: [document] });
  }, []);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialog({ open: false, documents: [] });
  }, []);

  const confirmDelete = useCallback(async () => {
    const documentsToDelete = deleteDialog.documents;
    if (documentsToDelete.length === 0) {
      return;
    }

    try {
      await Promise.all(
        documentsToDelete.map((document) => deleteDocumentMutation.mutateAsync(document.id))
      );
      invalidateKnowledgeBaseQueries();
    } catch {
      // deletion failed — query will refetch
    } finally {
      handleCloseDeleteDialog();
    }
  }, [
    deleteDialog.documents,
    deleteDocumentMutation,
    handleCloseDeleteDialog,
    invalidateKnowledgeBaseQueries,
  ]);

  const handleDownloadDocument = useCallback((document: DocumentListItem) => {
    openInNewTab(`/api/v1/documents/${document.id}/download`);
  }, []);

  if (!knowledgeBaseId) {
    return <KnowledgeBaseDetailMissingIdState />;
  }

  if (kbLoading) {
    return <KnowledgeBaseDetailLoadingState />;
  }

  if (kbError) {
    return <KnowledgeBaseDetailErrorState />;
  }

  if (!knowledgeBase) {
    return <KnowledgeBaseDetailNotFoundState />;
  }

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        <KnowledgeBaseDetailHeader
          knowledgeBase={knowledgeBase}
          onOpenSettings={() => setEditDialogOpen(true)}
        />
        <KnowledgeBaseDocumentsToolbar
          search={search}
          viewMode={viewMode}
          onSearchChange={setSearch}
          onClearSearch={() => setSearch('')}
          onViewModeChange={setViewMode}
          onOpenUpload={() => setUploadOpen(true)}
        />
        <KnowledgeBaseDocumentsContent
          docsLoading={docsLoading}
          filteredDocuments={filteredDocuments}
          search={search}
          viewMode={viewMode}
          onDocumentClick={handleDocumentClick}
          onDeleteDocument={handleDeleteDocument}
          onDownloadDocument={handleDownloadDocument}
          onClearSearch={() => setSearch('')}
          onOpenUpload={() => setUploadOpen(true)}
        />
      </div>

      <KnowledgeBaseUploadDialog
        open={uploadOpen}
        knowledgeBaseId={knowledgeBaseId}
        onOpenChange={setUploadOpen}
        onSuccess={handleUploadSuccess}
      />

      <KnowledgeBaseDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        knowledgeBase={knowledgeBase}
      />

      <KnowledgeBaseDeleteDialog
        deleteDialog={deleteDialog}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDeleteDialog();
          }
        }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
