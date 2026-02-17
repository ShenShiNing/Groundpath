import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Download, Eye, FileText, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentReader, DocumentInfo, DocumentEditor } from '@/components/documents';
import { useDocument, useDocumentContent, useSaveDocumentContent } from '@/hooks';
import { documentsApi } from '@/api';

type ViewMode = 'read' | 'edit';

export function DocumentDetailPage() {
  const { id } = useParams({ from: '/documents/$id' });
  const { data: document, isLoading } = useDocument(id);
  const { data: content, isLoading: isContentLoading } = useDocumentContent(id);
  const { mutateAsync: saveContent, isPending: isSaving } = useSaveDocumentContent();

  const isEditable = !!content?.isEditable;
  const editorKey = content ? `${document?.id ?? id}:${content.currentVersion}` : id;

  const getInitialMode = (): ViewMode => {
    if (isEditable) return 'edit';
    return 'read';
  };

  const [mode, setMode] = useState<ViewMode>(getInitialMode);

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

  const renderContent = () => {
    if (mode === 'edit' && isEditable) {
      if (isLoading || isContentLoading) {
        return (
          <DocumentReader
            documentType={content?.documentType ?? document!.documentType}
            textContent={content?.textContent ?? null}
            storageUrl={content?.storageUrl ?? null}
            isLoading
          />
        );
      }
      return (
        <DocumentEditor
          key={editorKey}
          documentId={document!.id}
          documentType={content?.documentType ?? document!.documentType}
          initialContent={content?.textContent ?? ''}
          isSaving={isSaving}
          isTruncated={content?.isTruncated ?? false}
          onSave={handleSaveContent}
          onError={handleSaveError}
        />
      );
    }

    return (
      <DocumentReader
        documentType={content?.documentType ?? document!.documentType}
        textContent={content?.textContent ?? null}
        storageUrl={content?.storageUrl ?? null}
        isLoading={isLoading || isContentLoading}
      />
    );
  };

  return (
    <AppLayout>
      <div className="relative flex-1 overflow-y-auto bg-background px-6 py-8 md:py-10">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-72 w-152 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="mx-auto w-full max-w-7xl space-y-6">
          <section className="rounded-2xl border bg-card/70 p-6 md:p-8">
            <div className="flex flex-wrap items-start gap-3">
              <Button variant="ghost" size="icon" className="size-8 cursor-pointer" asChild>
                <Link to="/knowledge-bases">
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>

              <div className="min-w-0 flex-1">
                <h1 className="font-display truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                  {isLoading ? '文档加载中...' : (content?.title ?? document?.title ?? '文档详情')}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <FileText className="size-3.5" />
                    {document?.documentType?.toUpperCase() ?? 'DOCUMENT'}
                  </span>
                  <span>支持阅读与在线编辑</span>
                </div>
              </div>

              {document && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={mode === 'read' ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setMode('read')}
                  >
                    <Eye className="size-4 mr-1.5" />
                    阅读
                  </Button>

                  {isEditable && (
                    <Button
                      variant={mode === 'edit' ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => setMode('edit')}
                    >
                      <PencilLine className="size-4 mr-1.5" />
                      编辑
                    </Button>
                  )}

                  <Button variant="outline" className="cursor-pointer" onClick={handleDownload}>
                    <Download className="size-4 mr-1.5" />
                    下载
                  </Button>
                </div>
              )}
            </div>
          </section>

          {document && (
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2 bg-card/80">
                <CardHeader>
                  <CardTitle>{mode === 'edit' ? '文档编辑器' : '文档预览'}</CardTitle>
                </CardHeader>
                <CardContent>{renderContent()}</CardContent>
              </Card>

              <Card className="bg-card/80">
                <CardHeader>
                  <CardTitle>文档信息</CardTitle>
                </CardHeader>
                <CardContent>
                  <DocumentInfo document={document} />
                </CardContent>
              </Card>
            </section>
          )}

          {!isLoading && !document && (
            <Card className="bg-card/80">
              <CardContent className="py-14 text-center">
                <p className="text-muted-foreground">文档不存在或无访问权限</p>
                <Link to="/knowledge-bases" className="mt-4 inline-block">
                  <Button variant="outline" className="cursor-pointer">
                    返回知识库列表
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default DocumentDetailPage;
