import { FileText, Calendar, HardDrive, Tag } from 'lucide-react';
import type { DocumentInfo, DocumentType } from '@knowledge-agent/shared/types';

interface DocumentInfoProps {
  document: DocumentInfo;
}

const documentTypeLabels: Record<DocumentType, string> = {
  pdf: 'PDF Document',
  markdown: 'Markdown File',
  text: 'Text File',
  docx: 'Word Document',
  other: 'Other',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DocumentInfo({ document }: DocumentInfoProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">File:</span>
        <span className="font-medium">{document.fileName}</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Type:</span>
        <span className="font-medium">{documentTypeLabels[document.documentType]}</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <HardDrive className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Size:</span>
        <span className="font-medium">{formatFileSize(document.fileSize)}</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Created:</span>
        <span className="font-medium">{formatDate(document.createdAt)}</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Modified:</span>
        <span className="font-medium">{formatDate(document.updatedAt)}</span>
      </div>

      {document.description && (
        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground mb-1">Description</p>
          <p className="text-sm">{document.description}</p>
        </div>
      )}
    </div>
  );
}
