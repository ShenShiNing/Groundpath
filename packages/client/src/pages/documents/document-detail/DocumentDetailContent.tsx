import { lazy, Suspense } from 'react';
import type { DocumentType } from '@groundpath/shared/types';
import { DocumentReader } from '@/components/documents';

const LazyDocumentEditor = lazy(async () => {
  const module = await import('@/components/documents/DocumentEditor');
  return { default: module.DocumentEditor };
});

interface DocumentDetailContentProps {
  mode: 'read' | 'edit';
  documentId: string;
  documentType: DocumentType;
  textContent: string | null;
  storageUrl: string | null;
  isPageLoading: boolean;
  isEditable: boolean;
  isSaving: boolean;
  isTruncated: boolean;
  editorKey: string;
  onSave: (value: string) => Promise<void>;
  onError: (error: unknown) => void;
}

export function DocumentDetailContent({
  mode,
  documentId,
  documentType,
  textContent,
  storageUrl,
  isPageLoading,
  isEditable,
  isSaving,
  isTruncated,
  editorKey,
  onSave,
  onError,
}: DocumentDetailContentProps) {
  const readerFallback = (
    <DocumentReader
      documentType={documentType}
      textContent={textContent}
      storageUrl={storageUrl}
      isLoading={isPageLoading}
    />
  );

  if (isPageLoading) {
    return readerFallback;
  }

  if (mode === 'edit' && isEditable) {
    return (
      <Suspense fallback={readerFallback}>
        <LazyDocumentEditor
          key={editorKey}
          documentId={documentId}
          documentType={documentType}
          initialContent={textContent ?? ''}
          isSaving={isSaving}
          isTruncated={isTruncated}
          onSave={onSave}
          onError={onError}
        />
      </Suspense>
    );
  }

  return (
    <DocumentReader
      documentType={documentType}
      textContent={textContent}
      storageUrl={storageUrl}
      isLoading={false}
    />
  );
}
