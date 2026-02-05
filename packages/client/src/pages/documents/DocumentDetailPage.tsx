import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Download } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentReader, DocumentInfo, DocumentEditor } from '@/components/documents';
import { useDocument, useDocumentContent, useSaveDocumentContent } from '@/hooks';
import { documentsApi } from '@/api';

export function DocumentDetailPage() {
  const { id } = useParams({ from: '/documents/$id' });
  const { data: document, isLoading } = useDocument(id);
  const { data: content, isLoading: isContentLoading } = useDocumentContent(id);
  const { mutateAsync: saveContent, isPending: isSaving } = useSaveDocumentContent();
  const [mode, setMode] = useState<'read' | 'edit'>(() => (isEditable ? 'edit' : 'read'));

  const isEditable = !!content?.isEditable;
  const editorKey = content ? `${document?.id ?? id}:${content.currentVersion}` : id;

  const handleDownload = () => {
    if (!document) return;
    const url = documentsApi.getDownloadUrl(document.id);
    window.open(url, '_blank');
  };

  const handleSaveContent = async (value: string) => {
    await saveContent({ id, data: { content: value } });
    toast.success('文档已保存');
  };

  const handleSaveError = (error: unknown) => {
    toast.error(error instanceof Error ? error.message : '保存失败');
  };

  return (
    <AppLayout>
      <div className="container max-w-5xl py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link to="/knowledge-bases">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {isLoading ? 'Loading...' : (content?.title ?? document?.title ?? 'Document')}
            </h1>
          </div>
          {document && (
            <div className="flex items-center gap-2">
              {isEditable && (
                <>
                  <Button
                    variant={mode === 'read' ? 'default' : 'outline'}
                    onClick={() => setMode('read')}
                  >
                    阅读
                  </Button>
                  <Button
                    variant={mode === 'edit' ? 'default' : 'outline'}
                    onClick={() => setMode('edit')}
                  >
                    编辑
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          )}
        </div>

        {document && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Preview */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>{mode === 'edit' ? 'Editor' : 'Preview'}</CardTitle>
                </CardHeader>
                <CardContent>
                  {mode === 'edit' && isEditable ? (
                    isLoading || isContentLoading ? (
                      <DocumentReader
                        documentType={content?.documentType ?? document.documentType}
                        textContent={content?.textContent ?? null}
                        storageUrl={content?.storageUrl ?? null}
                        isLoading
                      />
                    ) : (
                      <DocumentEditor
                        key={editorKey}
                        documentId={document.id}
                        documentType={content?.documentType ?? document.documentType}
                        initialContent={content?.textContent ?? ''}
                        isSaving={isSaving}
                        isTruncated={content?.isTruncated ?? false}
                        onSave={handleSaveContent}
                        onError={handleSaveError}
                      />
                    )
                  ) : (
                    <DocumentReader
                      documentType={content?.documentType ?? document.documentType}
                      textContent={content?.textContent ?? null}
                      storageUrl={content?.storageUrl ?? null}
                      isLoading={isLoading || isContentLoading}
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Document Info Sidebar */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <DocumentInfo document={document} />
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!isLoading && !document && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Document not found</p>
              <Link to="/knowledge-bases" className="mt-4 inline-block">
                <Button variant="outline">Back to Knowledge Bases</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

export default DocumentDetailPage;
