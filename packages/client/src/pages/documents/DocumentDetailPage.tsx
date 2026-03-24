import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { DocumentType, DocumentVersionListItem } from '@groundpath/shared/types';
import { toast } from 'sonner';
import { DocumentInfo, AIRewriteDialog } from '@/components/documents';
import { documentsApi } from '@/api';
import {
  useDocument,
  useDocumentContent,
  useDocumentVersions,
  useRestoreVersion,
  useSaveDocumentContent,
} from '@/hooks';
import { openInNewTab } from '@/lib/utils';
import { syncDocumentMode, type ViewMode } from './documentDetailMode';
import { DocumentDetailContent } from './document-detail/DocumentDetailContent';
import { DocumentDetailHeader } from './document-detail/DocumentDetailHeader';
import { DocumentDetailState } from './document-detail/DocumentDetailState';
import { DocumentRestoreDialog } from './document-detail/DocumentRestoreDialog';
import { DocumentVersionHistory } from './document-detail/DocumentVersionHistory';

export function DocumentDetailPage() {
  const { t } = useTranslation(['document', 'common']);
  const navigate = useNavigate();
  const { id } = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const documentId = typeof id === 'string' ? id : undefined;
  const safeDocumentId = documentId ?? '';
  const fromKnowledgeBaseId =
    typeof search.fromKnowledgeBaseId === 'string' ? search.fromKnowledgeBaseId : undefined;
  const { data: document, isLoading, isError: docError } = useDocument(documentId);
  const {
    data: content,
    isLoading: isContentLoading,
    isError: contentError,
  } = useDocumentContent(documentId);
  const {
    data: versionHistory,
    isLoading: isVersionLoading,
    isError: versionError,
  } = useDocumentVersions(documentId);
  const { mutateAsync: restoreVersion, isPending: isRestoringVersion } = useRestoreVersion();
  const { mutateAsync: saveContent, isPending: isSaving } = useSaveDocumentContent();

  const isPageLoading = isLoading || isContentLoading;
  const isPageError = docError || contentError;
  const isContentReady = !isContentLoading;
  const isEditable = !!content?.isEditable;
  const resolvedDocumentType: DocumentType =
    content?.documentType ?? document?.documentType ?? 'text';
  const editorKey = content
    ? `${document?.id ?? safeDocumentId}:${content.currentVersion}`
    : safeDocumentId;
  const versions = versionHistory?.versions ?? [];
  const currentVersion =
    versionHistory?.currentVersion ?? content?.currentVersion ?? document?.currentVersion ?? 0;

  const [modeOverride, setModeOverride] = useState<{ documentId: string; mode: ViewMode | null }>({
    documentId: safeDocumentId,
    mode: null,
  });
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersionListItem | null>(null);
  const [aiRewriteOpen, setAiRewriteOpen] = useState(false);

  const hasUserSelectedMode =
    modeOverride.documentId === safeDocumentId && modeOverride.mode !== null;
  const mode = useMemo(
    () =>
      syncDocumentMode({
        currentMode: hasUserSelectedMode ? (modeOverride.mode ?? 'read') : 'read',
        isEditable,
        isContentReady,
        hasUserSelectedMode,
      }),
    [hasUserSelectedMode, isContentReady, isEditable, modeOverride.mode]
  );

  const handleDownload = () => {
    if (!document) return;
    const url = documentsApi.getDownloadUrl(document.id);
    openInNewTab(url);
  };

  const handleSaveContent = async (value: string) => {
    if (!documentId) {
      toast.error(t('notFound'));
      return;
    }
    await saveContent({ id: documentId, data: { content: value } });
    toast.success(t('toast.saved'));
  };

  const handleSaveError = (error: unknown) => {
    toast.error(error instanceof Error ? error.message : t('toast.saveFailed'));
  };

  const handleModeChange = (nextMode: ViewMode) => {
    setModeOverride({ documentId: safeDocumentId, mode: nextMode });
  };

  const handleBackToList = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }

    if (fromKnowledgeBaseId) {
      void navigate({
        to: '/knowledge-bases/$id',
        params: { id: fromKnowledgeBaseId },
      });
      return;
    }

    void navigate({ to: '/knowledge-bases' });
  };

  const openRestoreDialog = (version: DocumentVersionListItem) => {
    setSelectedVersion(version);
    setRestoreDialogOpen(true);
  };

  const handleConfirmRestore = async () => {
    if (!selectedVersion || !documentId) return;

    try {
      await restoreVersion({ documentId, versionId: selectedVersion.id });
      toast.success(t('versions.toast.restored', { version: selectedVersion.version }));
    } catch {
      toast.error(t('versions.toast.restoreFailed'));
    } finally {
      setRestoreDialogOpen(false);
      setSelectedVersion(null);
    }
  };

  if (isPageError && !isPageLoading) {
    return <DocumentDetailState message={t('error.loadFailed')} onAction={handleBackToList} tone="destructive" />;
  }

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <DocumentDetailHeader
          title={content?.title ?? document?.title ?? t('page.title')}
          documentType={document?.documentType}
          currentVersion={currentVersion}
          isPageLoading={isPageLoading}
          showActions={!!document}
          isEditable={isEditable}
          mode={mode}
          onBack={handleBackToList}
          onReadMode={() => handleModeChange('read')}
          onEditMode={() => handleModeChange('edit')}
          onAiRewrite={() => setAiRewriteOpen(true)}
          onDownload={handleDownload}
        />

        {(document || isPageLoading) && (
          <div className="flex-1 overflow-y-auto">
            <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_360px]">
              <div className="px-6 py-6">
                <h2 className="mb-4 text-lg font-semibold">
                  {mode === 'edit' ? t('card.editor') : t('card.preview')}
                </h2>
                <DocumentDetailContent
                  mode={mode}
                  documentId={document?.id ?? safeDocumentId}
                  documentType={resolvedDocumentType}
                  textContent={content?.textContent ?? null}
                  storageUrl={content?.storageUrl ?? null}
                  isPageLoading={isPageLoading}
                  isEditable={isEditable}
                  isSaving={isSaving}
                  isTruncated={content?.isTruncated ?? false}
                  editorKey={editorKey}
                  onSave={handleSaveContent}
                  onError={handleSaveError}
                />
              </div>

              {document && (
                <aside className="space-y-8 border-l px-6 py-6">
                  <section>
                    <h2 className="mb-4 text-lg font-semibold">{t('card.info')}</h2>
                    <DocumentInfo document={document} />
                  </section>

                  <section>
                    <h2 className="mb-1 text-lg font-semibold">{t('versions.title')}</h2>
                    <p className="mb-4 text-xs text-muted-foreground">
                      {t('versions.description')}
                    </p>
                    <DocumentVersionHistory
                      versions={versions}
                      currentVersion={currentVersion}
                      isVersionLoading={isVersionLoading}
                      isVersionError={versionError}
                      isRestoringVersion={isRestoringVersion}
                      onRestore={openRestoreDialog}
                    />
                  </section>
                </aside>
              )}
            </div>
          </div>
        )}

        {!isPageLoading && (!documentId || !document) && (
          <DocumentDetailState message={t('notFound')} onAction={handleBackToList} />
        )}
      </div>

      <DocumentRestoreDialog
        open={restoreDialogOpen}
        selectedVersion={selectedVersion}
        onOpenChange={setRestoreDialogOpen}
        onConfirm={handleConfirmRestore}
      />

      <AIRewriteDialog
        open={aiRewriteOpen}
        onOpenChange={setAiRewriteOpen}
        documentId={safeDocumentId}
        documentTitle={content?.title ?? document?.title ?? ''}
        currentContent={content?.textContent ?? ''}
        onSaveSuccess={() => {
          setAiRewriteOpen(false);
          toast.success(t('aiRewrite.saved'));
        }}
      />
    </>
  );
}

export default DocumentDetailPage;
