import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Download } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentViewer, DocumentInfo } from '@/components/documents';
import { useDocument } from '@/hooks';
import { documentsApi } from '@/api';

export function DocumentDetailPage() {
  const { id } = useParams({ from: '/documents/$id' });
  const { data: document, isLoading } = useDocument(id);

  const handleDownload = () => {
    if (!document) return;
    const url = documentsApi.getDownloadUrl(document.id);
    window.open(url, '_blank');
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
              {isLoading ? 'Loading...' : (document?.title ?? 'Document')}
            </h1>
          </div>
          {document && (
            <div className="flex items-center gap-2">
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
                  <CardTitle>Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <DocumentViewer
                    documentType={document.documentType}
                    textContent={null}
                    storageUrl={null}
                    fileName={document.fileName}
                    isLoading={isLoading}
                  />
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
