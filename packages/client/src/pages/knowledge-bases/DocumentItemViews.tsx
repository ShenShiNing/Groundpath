import { FileText, MoreHorizontal, Pencil, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableCell, TableRow } from '@/components/ui/table';
import { ProcessingStatusBadge } from '@/components/documents/ProcessingStatusBadge';
import { formatBytes, cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { DocumentListItem, DocumentType } from '@groundpath/shared/types';

export const documentTypeConfig: Record<DocumentType, { color: string; bgColor: string }> = {
  pdf: { color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-500/10' },
  markdown: {
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-500/10',
  },
  text: { color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-500/10' },
  docx: { color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-500/10' },
  other: { color: 'text-gray-500 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-400/10' },
};

interface DocumentItemProps {
  document: DocumentListItem;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDownload: () => void;
}

export function DocumentGridCard({
  document,
  onSelect,
  onEdit,
  onDelete,
  onDownload,
}: DocumentItemProps) {
  const { t } = useTranslation(['knowledgeBase', 'common']);
  const config = documentTypeConfig[document.documentType];

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-card/80 p-4',
        'hover:bg-accent/35 hover:border-foreground/15 hover:shadow-sm',
        'transition-all duration-200 cursor-pointer'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('size-10 rounded-lg flex items-center justify-center', config.bgColor)}>
          <FileText className={cn('size-5', config.color)} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity -mr-1 -mt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="size-4 mr-2" />
              {t('edit', { ns: 'common' })}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
            >
              <Download className="size-4 mr-2" />
              {t('download', { ns: 'common' })}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="size-4 mr-2" />
              {t('delete', { ns: 'common' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h4 className="font-medium text-sm leading-snug truncate mb-1.5" title={document.title}>
        {document.title}
      </h4>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <span className="font-mono uppercase">{document.fileExtension}</span>
        <span className="text-muted-foreground/50">/</span>
        <span>{formatBytes(document.fileSize)}</span>
      </div>

      <div className="mt-auto">
        <ProcessingStatusBadge status={document.processingStatus} />
      </div>
    </div>
  );
}

export function DocumentTableRow({
  document,
  onSelect,
  onEdit,
  onDelete,
  onDownload,
}: DocumentItemProps) {
  const { t } = useTranslation(['knowledgeBase', 'common']);
  const config = documentTypeConfig[document.documentType];

  return (
    <TableRow className="group cursor-pointer hover:bg-muted/40" onClick={onSelect}>
      <TableCell className="py-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'size-8 rounded-md flex items-center justify-center shrink-0',
              config.bgColor
            )}
          >
            <FileText className={cn('size-4', config.color)} />
          </div>
          <span className="font-medium text-sm truncate">{document.title}</span>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground font-mono">
        {document.fileExtension.toUpperCase()}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatBytes(document.fileSize)}
      </TableCell>
      <TableCell>
        <ProcessingStatusBadge status={document.processingStatus} />
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
              <Pencil className="size-4 mr-2" />
              {t('edit', { ns: 'common' })}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={onDownload}>
              <Download className="size-4 mr-2" />
              {t('download', { ns: 'common' })}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="cursor-pointer" onClick={onDelete}>
              <Trash2 className="size-4 mr-2" />
              {t('delete', { ns: 'common' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
