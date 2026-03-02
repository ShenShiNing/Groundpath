import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { DocumentType } from '@knowledge-agent/shared/types';
import { ArrowLeft, Download, Eye, FileText, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { DocumentReader, DocumentInfo } from '@/components/documents';
import { useDocument, useDocumentContent, useSaveDocumentContent } from '@/hooks';
import { documentsApi } from '@/api';
import { openInNewTab } from '@/lib/utils';
import { syncDocumentMode, type ViewMode } from './documentDetailMode';

const LazyDocumentEditor = lazy(async () => {
  const module = await import('@/components/documents/DocumentEditor');
  return { default: module.DocumentEditor };
});

export function DocumentDetailPage() {
  const { t } = useTranslation('document');
  const { id } = useParams({ from: '/documents/$id' });
  const { data: document, isLoading } = useDocument(id);
  const { data: content, isLoading: isContentLoading } = useDocumentContent(id);
  const { mutateAsync: saveContent, isPending: isSaving } = useSaveDocumentContent();

  const isPageLoading = isLoading || isContentLoading;
  const isContentReady = !isContentLoading;
  const isEditable = !!content?.isEditable;
  const resolvedDocumentType: DocumentType =
    content?.documentType ?? document?.documentType ?? 'text';
  const editorKey = content ? `${document?.id ?? id}:${content.currentVersion}` : id;

  const [modeOverride, setModeOverride] = useState<{ documentId: string; mode: ViewMode | null }>({
    documentId: id,
    mode: null,
  });
  const hasUserSelectedMode = modeOverride.documentId === id && modeOverride.mode !== null;
  const mode = useMemo(
    () =>
      syncDocumentMode({
        currentMode: hasUserSelectedMode ? modeOverride.mode : 'read',
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
    await saveContent({ id, data: { content: value } });
    toast.success(t('toast.saved'));
  };

  const handleSaveError = (error: unknown) => {
    toast.error(error instanceof Error ? error.message : t('toast.saveFailed'));
  };

  const handleModeChange = (nextMode: ViewMode) => {
    setModeOverride({ documentId: id, mode: nextMode });
  };

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
            documentId={document?.id ?? id}
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

  return (
    <AppLayout>
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
            <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_320px]">
              <div className="px-6 py-6">
                <h2 className="mb-4 text-lg font-semibold">
                  {mode === 'edit' ? t('card.editor') : t('card.preview')}
                </h2>
                {renderContent()}
              </div>

              {document && (
                <div className="border-l px-6 py-6">
                  <h2 className="mb-4 text-lg font-semibold">{t('card.info')}</h2>
                  <DocumentInfo document={document} />
                </div>
              )}
            </div>
          </div>
        )}

        {!isPageLoading && !document && (
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
    </AppLayout>
  );
}

export default DocumentDetailPage;
