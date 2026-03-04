import { FileText, Calendar, HardDrive, Tag, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DocumentInfo, DocumentType } from '@knowledge-agent/shared/types';

interface DocumentInfoProps {
  document: DocumentInfo;
}

const documentTypeKeyMap: Record<DocumentType, string> = {
  pdf: 'type.pdf',
  markdown: 'type.markdown',
  text: 'type.text',
  docx: 'type.docx',
  other: 'type.other',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date, locale: string): string {
  return new Date(date).toLocaleString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DocumentInfo({ document }: DocumentInfoProps) {
  const { t, i18n } = useTranslation('document');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">{t('info.file')}</span>
        <span className="font-medium">{document.fileName}</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">{t('info.type')}</span>
        <span className="font-medium">{t(documentTypeKeyMap[document.documentType])}</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">{t('info.version')}</span>
        <span className="font-medium">v{document.currentVersion}</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <HardDrive className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">{t('info.size')}</span>
        <span className="font-medium">{formatFileSize(document.fileSize)}</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">{t('info.created')}</span>
        <span className="font-medium">{formatDate(document.createdAt, i18n.language)}</span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">{t('info.modified')}</span>
        <span className="font-medium">{formatDate(document.updatedAt, i18n.language)}</span>
      </div>

      {document.description && (
        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground mb-1">{t('info.description')}</p>
          <p className="text-sm">{document.description}</p>
        </div>
      )}
    </div>
  );
}
