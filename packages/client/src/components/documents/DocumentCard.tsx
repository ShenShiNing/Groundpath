import { Link } from '@tanstack/react-router';
import { FileText, FileType, File, MoreVertical, Download, Pencil, Trash2 } from 'lucide-react';
import type { DocumentListItem, DocumentType } from '@knowledge-agent/shared/types';
import { cn, openInNewTab } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { documentsApi } from '@/api';
import { useTranslation } from 'react-i18next';

interface DocumentCardProps {
  document: DocumentListItem;
  onEdit?: (document: DocumentListItem) => void;
  onDelete?: (document: DocumentListItem) => void;
  className?: string;
}

const documentTypeIcons: Record<DocumentType, typeof FileText> = {
  pdf: FileText,
  markdown: FileType,
  text: File,
  docx: FileText,
  other: File,
};

const documentTypeColors: Record<DocumentType, string> = {
  pdf: 'text-red-500',
  markdown: 'text-blue-500',
  text: 'text-gray-500',
  docx: 'text-blue-600',
  other: 'text-gray-400',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function DocumentCard({ document, onEdit, onDelete, className }: DocumentCardProps) {
  const { t } = useTranslation('document');
  const Icon = documentTypeIcons[document.documentType];
  const iconColor = documentTypeColors[document.documentType];

  const handleDownload = () => {
    const url = documentsApi.getDownloadUrl(document.id);
    openInNewTab(url);
  };

  return (
    <Card className={cn('group hover:shadow-md transition-shadow', className)}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn('shrink-0 p-2 rounded-lg bg-muted', iconColor)}>
            <Icon className="h-6 w-6" />
          </div>

          <div className="flex-1 min-w-0">
            <Link
              to="/documents/$id"
              params={{ id: document.id }}
              className="block group-hover:text-primary transition-colors"
            >
              <h3 className="font-medium truncate">{document.title}</h3>
            </Link>
            {document.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {document.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span>{formatFileSize(document.fileSize)}</span>
              <span>•</span>
              <span>{document.fileExtension.toUpperCase()}</span>
              <span>•</span>
              <span>{formatDate(document.updatedAt)}</span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                {t('cardAction.download')}
              </DropdownMenuItem>
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(document)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('cardAction.edit')}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(document)} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('cardAction.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
