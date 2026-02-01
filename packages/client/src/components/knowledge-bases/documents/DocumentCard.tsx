import {
  FileText,
  FileType,
  File as FileIcon,
  MoreHorizontal,
  Download,
  Pencil,
  Trash2,
  FolderInput,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProcessingStatusBadge } from './ProcessingStatusBadge';
import type { DocumentListItem, DocumentType } from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

export interface DocumentCardProps {
  document: DocumentListItem;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onSelect: () => void;
  onCheckboxChange: (checked: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onDownload?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

const documentTypeConfig: Record<
  DocumentType,
  { icon: typeof FileText; color: string; bgColor: string }
> = {
  pdf: {
    icon: FileText,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  markdown: {
    icon: FileType,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  text: {
    icon: FileIcon,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },
  docx: {
    icon: FileText,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  other: {
    icon: FileIcon,
    color: 'text-gray-400',
    bgColor: 'bg-gray-400/10',
  },
};

// ============================================================================
// Component
// ============================================================================

export function DocumentCard({
  document,
  isSelected,
  isMultiSelectMode,
  onSelect,
  onCheckboxChange,
  onEdit,
  onDelete,
  onMove,
  onDownload,
}: DocumentCardProps) {
  const config = documentTypeConfig[document.documentType];
  const Icon = config.icon;

  const handleClick = (e: React.MouseEvent) => {
    // Handle Ctrl/Cmd click for multi-select
    if (e.ctrlKey || e.metaKey) {
      onCheckboxChange(!isSelected);
      return;
    }
    onSelect();
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCheckboxChange(!isSelected);
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col p-4 rounded-xl border bg-card',
        'hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer',
        isSelected && 'border-primary bg-primary/5 ring-1 ring-primary/20'
      )}
      onClick={handleClick}
    >
      {/* Checkbox (visible on hover or when selected) */}
      <div
        className={cn(
          'absolute top-3 left-3 z-10',
          isMultiSelectMode || isSelected
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 transition-opacity'
        )}
        onClick={handleCheckboxClick}
      >
        <div
          className={cn(
            'size-5 rounded border-2',
            'flex items-center justify-center',
            'transition-colors',
            isSelected
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-muted-foreground/40 hover:border-primary'
          )}
        >
          {isSelected && (
            <svg className="size-3" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6L5 8.5L9.5 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Actions Menu */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-4 mr-2" />
                Edit
              </DropdownMenuItem>
            )}
            {onMove && (
              <DropdownMenuItem onClick={onMove}>
                <FolderInput className="size-4 mr-2" />
                Move to...
              </DropdownMenuItem>
            )}
            {onDownload && (
              <DropdownMenuItem onClick={onDownload}>
                <Download className="size-4 mr-2" />
                Download
              </DropdownMenuItem>
            )}
            {(onEdit || onMove || onDownload) && onDelete && <DropdownMenuSeparator />}
            {onDelete && (
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-4 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Document Icon */}
      <div
        className={cn('w-12 h-12 rounded-lg flex items-center justify-center mb-3', config.bgColor)}
      >
        <Icon className={cn('size-6', config.color)} />
      </div>

      {/* Document Title */}
      <h4 className="font-medium text-sm truncate mb-1" title={document.title}>
        {document.title}
      </h4>

      {/* Document Meta */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span>{document.fileExtension.toUpperCase()}</span>
        <span>·</span>
        <span>{formatBytes(document.fileSize)}</span>
      </div>

      {/* Processing Status */}
      <div className="mt-auto pt-2">
        <ProcessingStatusBadge status={document.processingStatus} />
      </div>
    </div>
  );
}
