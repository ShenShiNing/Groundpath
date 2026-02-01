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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

export interface DocumentTableProps {
  documents: DocumentListItem[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onDocumentClick: (doc: DocumentListItem) => void;
  onEdit?: (doc: DocumentListItem) => void;
  onDelete?: (doc: DocumentListItem) => void;
  onMove?: (doc: DocumentListItem) => void;
  onDownload?: (doc: DocumentListItem) => void;
}

// ============================================================================
// Helpers
// ============================================================================

const documentTypeConfig: Record<DocumentType, { icon: typeof FileText; color: string }> = {
  pdf: { icon: FileText, color: 'text-red-500' },
  markdown: { icon: FileType, color: 'text-purple-500' },
  text: { icon: FileIcon, color: 'text-gray-500' },
  docx: { icon: FileText, color: 'text-blue-500' },
  other: { icon: FileIcon, color: 'text-gray-400' },
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ============================================================================
// Component
// ============================================================================

export function DocumentTable({
  documents,
  selectedIds,
  onSelectionChange,
  onDocumentClick,
  onEdit,
  onDelete,
  onMove,
  onDownload,
}: DocumentTableProps) {
  const allSelected = documents.length > 0 && documents.every((d) => selectedIds.has(d.id));
  const someSelected = documents.some((d) => selectedIds.has(d.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(documents.map((d) => d.id));
      onSelectionChange(allIds);
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    onSelectionChange(newSelection);
  };

  const handleRowClick = (doc: DocumentListItem, e: React.MouseEvent) => {
    // Handle Ctrl/Cmd click for multi-select
    if (e.ctrlKey || e.metaKey) {
      handleSelectOne(doc.id, !selectedIds.has(doc.id));
      return;
    }
    onDocumentClick(doc);
  };

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="size-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">No documents in this folder</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Upload files or create a subfolder to get started
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected}
              data-state={
                someSelected && !allSelected
                  ? 'indeterminate'
                  : allSelected
                    ? 'checked'
                    : 'unchecked'
              }
              onCheckedChange={handleSelectAll}
              aria-label="Select all"
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="w-20">Type</TableHead>
          <TableHead className="w-25">Size</TableHead>
          <TableHead className="w-30">Status</TableHead>
          <TableHead className="w-30">Updated</TableHead>
          <TableHead className="w-15"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((doc) => {
          const config = documentTypeConfig[doc.documentType];
          const Icon = config.icon;
          const isSelected = selectedIds.has(doc.id);

          return (
            <TableRow
              key={doc.id}
              className={cn('cursor-pointer', isSelected && 'bg-primary/5')}
              data-state={isSelected ? 'selected' : undefined}
              onClick={(e) => handleRowClick(doc, e)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => handleSelectOne(doc.id, !!checked)}
                  aria-label={`Select ${doc.title}`}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Icon className={cn('size-5 shrink-0', config.color)} />
                  <span className="font-medium truncate max-w-75" title={doc.title}>
                    {doc.title}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {doc.fileExtension.toUpperCase()}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatBytes(doc.fileSize)}</TableCell>
              <TableCell>
                <ProcessingStatusBadge status={doc.processingStatus} />
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(doc.updatedAt)}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(doc)}>
                        <Pencil className="size-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onMove && (
                      <DropdownMenuItem onClick={() => onMove(doc)}>
                        <FolderInput className="size-4 mr-2" />
                        Move to...
                      </DropdownMenuItem>
                    )}
                    {onDownload && (
                      <DropdownMenuItem onClick={() => onDownload(doc)}>
                        <Download className="size-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                    )}
                    {(onEdit || onMove || onDownload) && onDelete && <DropdownMenuSeparator />}
                    {onDelete && (
                      <DropdownMenuItem variant="destructive" onClick={() => onDelete(doc)}>
                        <Trash2 className="size-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
