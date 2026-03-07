import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type {
  DocumentType,
  DocumentVersionListItem,
  VersionSource,
} from '@knowledge-agent/shared/types';
import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  History,
  PencilLine,
  RotateCcw,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { DocumentReader, DocumentInfo, AIRewriteDialog } from '@/components/documents';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { documentsApi } from '@/api';
import {
  useDocument,
  useDocumentContent,
  useDocumentVersions,
  useRestoreVersion,
  useSaveDocumentContent,
} from '@/hooks';
import { formatBytes, openInNewTab } from '@/lib/utils';
import { syncDocumentMode, type ViewMode } from './documentDetailMode';

const LazyDocumentEditor = lazy(async () => {
  const module = await import('@/components/documents/DocumentEditor');
  return { default: module.DocumentEditor };
});

export function DocumentDetailPage() {
  const { t } = useTranslation(['document', 'common']);
  const { id } = useParams({ strict: false });
  const documentId = typeof id === 'string' ? id : undefined;
  const safeDocumentId = documentId ?? '';
  const { data: document, isLoading } = useDocument(documentId);
  const { data: content, isLoading: isContentLoading } = useDocumentContent(documentId);
  const { data: versionHistory, isLoading: isVersionLoading } = useDocumentVersions(documentId);
  const { mutateAsync: restoreVersion, isPending: isRestoringVersion } = useRestoreVersion();
  const { mutateAsync: saveContent, isPending: isSaving } = useSaveDocumentContent();

  const isPageLoading = isLoading || isContentLoading;
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

  const getVersionSourceLabel = (source: VersionSource) =>
    t(`versions.source.${source}`, { defaultValue: source });

  const editorLoadingFallback = (
    <DocumentReader
      documentType={resolvedDocumentType}
      textContent={content?.textContent ?? null}
      storageUrl={content?.storageUrl ?? null}
      isLoading
    />
  );

  const renderContent = () => {
    if (isPageLoading) {
      return editorLoadingFallback;
    }

    if (mode === 'edit' && isEditable) {
      return (
        <Suspense fallback={editorLoadingFallback}>
          <LazyDocumentEditor
            key={editorKey}
            documentId={document?.id ?? safeDocumentId}
            documentType={resolvedDocumentType}
            initialContent={content?.textContent ?? ''}
            isSaving={isSaving}
            isTruncated={content?.isTruncated ?? false}
            onSave={handleSaveContent}
            onError={handleSaveError}
          />
        </Suspense>
      );
    }

    return (
      <DocumentReader
        documentType={resolvedDocumentType}
        textContent={content?.textContent ?? null}
        storageUrl={content?.storageUrl ?? null}
        isLoading={false}
      />
    );
  };

  const renderVersionHistory = () => {
    if (isVersionLoading) {
      return <p className="text-sm text-muted-foreground">{t('versions.loading')}</p>;
    }

    if (versions.length === 0) {
      return <p className="text-sm text-muted-foreground">{t('versions.empty')}</p>;
    }

    return (
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {versions.map((version) => {
          const isCurrent = version.version === currentVersion;

          return (
            <div key={version.id} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">v{version.version}</span>
                  {isCurrent && <Badge variant="secondary">{t('versions.current')}</Badge>}
                </div>

                {!isCurrent && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 cursor-pointer px-2.5 text-xs"
                    disabled={isRestoringVersion}
                    onClick={() => openRestoreDialog(version)}
                  >
                    <RotateCcw className="mr-1 size-3.5" />
                    {t('versions.action.restore')}
                  </Button>
                )}
              </div>

              <p className="truncate text-sm font-medium" title={version.fileName}>
                {version.fileName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {getVersionSourceLabel(version.source)}
              </p>

              {version.changeNote && (
                <p className="mt-1.5 wrap-break-word text-xs text-muted-foreground">
                  {version.changeNote}
                </p>
              )}

              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{new Date(version.createdAt).toLocaleString()}</span>
                <span>{formatBytes(version.fileSize)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b px-6 py-5">
          <div className="flex flex-wrap items-start gap-3">
            <Button variant="ghost" size="icon" className="size-8 cursor-pointer" asChild>
              <Link to="/knowledge-bases">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>

            <div className="min-w-0 flex-1">
              <h1 className="font-display truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                {isPageLoading
                  ? t('loading')
                  : (content?.title ?? document?.title ?? t('page.title'))}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" />
                  {document?.documentType?.toUpperCase() ?? 'DOCUMENT'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <History className="size-3.5" />
                  {currentVersion
                    ? t('versions.currentNumber', { version: currentVersion })
                    : t('versions.currentPending')}
                </span>
                <span>{t('page.subtitle')}</span>
              </div>
            </div>

            {document && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={mode === 'read' ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => handleModeChange('read')}
                >
                  <Eye className="size-4 mr-1.5" />
                  {t('action.read')}
                </Button>

                {isEditable && (
                  <Button
                    variant={mode === 'edit' ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => handleModeChange('edit')}
                  >
                    <PencilLine className="size-4 mr-1.5" />
                    {t('action.edit')}
                  </Button>
                )}

                {isEditable && (
                  <Button
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => setAiRewriteOpen(true)}
                  >
                    <Wand2 className="size-4 mr-1.5" />
                    {t('action.aiRewrite')}
                  </Button>
                )}

                <Button variant="outline" className="cursor-pointer" onClick={handleDownload}>
                  <Download className="size-4 mr-1.5" />
                  {t('action.download')}
                </Button>
              </div>
            )}
          </div>
        </header>

        {(document || isPageLoading) && (
          <div className="flex-1 overflow-y-auto">
            <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_360px]">
              <div className="px-6 py-6">
                <h2 className="mb-4 text-lg font-semibold">
                  {mode === 'edit' ? t('card.editor') : t('card.preview')}
                </h2>
                {renderContent()}
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
                    {renderVersionHistory()}
                  </section>
                </aside>
              )}
            </div>
          </div>
        )}

        {!isPageLoading && (!documentId || !document) && (
          <div className="flex-1 flex items-center justify-center">
            <div className="py-14 text-center">
              <p className="text-muted-foreground">{t('notFound')}</p>
              <Link to="/knowledge-bases" className="mt-4 inline-block">
                <Button variant="outline" className="cursor-pointer">
                  {t('action.backToList')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('versions.dialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('versions.dialog.description', { version: selectedVersion?.version ?? '-' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              {t('cancel', { ns: 'common' })}
            </AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={handleConfirmRestore}>
              {t('versions.dialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
