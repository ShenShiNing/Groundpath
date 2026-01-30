import { Loader2 } from 'lucide-react';
import type { DocumentType } from '@knowledge-agent/shared/types';
import { cn } from '@/lib/utils';

interface DocumentViewerProps {
  documentType: DocumentType;
  textContent: string | null;
  storageUrl: string | null;
  fileName: string;
  isLoading?: boolean;
  className?: string;
}

export function DocumentViewer({
  documentType,
  textContent,
  storageUrl,
  fileName,
  isLoading,
  className,
}: DocumentViewerProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // PDF viewer using iframe with public URL
  if (documentType === 'pdf' && storageUrl) {
    return (
      <div className={cn('w-full h-150 border rounded-lg overflow-hidden', className)}>
        <iframe src={storageUrl} title={fileName} className="w-full h-full" />
      </div>
    );
  }

  // Text/Markdown preview
  if ((documentType === 'text' || documentType === 'markdown') && textContent) {
    return (
      <div
        className={cn(
          'w-full min-h-100 max-h-150 overflow-auto border rounded-lg p-4 bg-muted/30',
          className
        )}
      >
        <pre className="whitespace-pre-wrap font-mono text-sm">{textContent}</pre>
      </div>
    );
  }

  // DOCX - show download prompt
  if (documentType === 'docx') {
    return (
      <div className={cn('text-center py-12 border rounded-lg bg-muted/30', className)}>
        <p className="text-muted-foreground mb-2">
          Word documents cannot be previewed in the browser.
        </p>
        <p className="text-sm text-muted-foreground">
          Please download the file to view its contents.
        </p>
      </div>
    );
  }

  // Fallback for unsupported types
  return (
    <div className={cn('text-center py-12 border rounded-lg bg-muted/30', className)}>
      <p className="text-muted-foreground">Preview not available for this document type.</p>
    </div>
  );
}
