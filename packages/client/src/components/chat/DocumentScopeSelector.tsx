import { useState } from 'react';
import { ChevronDown, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { DocumentListItem } from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

export interface DocumentScopeSelectorProps {
  documents: DocumentListItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function DocumentScopeSelector({
  documents,
  selectedIds,
  onChange,
  className,
}: DocumentScopeSelectorProps) {
  const [open, setOpen] = useState(false);

  const isAllSelected = selectedIds.length === 0;
  const selectedCount = selectedIds.length;

  const handleToggleDocument = (docId: string) => {
    if (selectedIds.includes(docId)) {
      onChange(selectedIds.filter((id) => id !== docId));
    } else {
      onChange([...selectedIds, docId]);
    }
  };

  const handleSelectAll = () => {
    onChange([]);
  };

  const handleClearSelection = () => {
    onChange([]);
  };

  const getSelectedDocumentNames = () => {
    if (isAllSelected) return [];
    return documents.filter((doc) => selectedIds.includes(doc.id)).map((doc) => doc.title);
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs justify-between min-w-35">
            <span className="truncate">
              {isAllSelected
                ? 'All documents'
                : `${selectedCount} document${selectedCount > 1 ? 's' : ''}`}
            </span>
            <ChevronDown className="size-3.5 ml-1 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-62.5">
          <DropdownMenuLabel className="text-xs">Document Scope</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* All Documents Option */}
          <DropdownMenuCheckboxItem checked={isAllSelected} onCheckedChange={handleSelectAll}>
            <span className="flex items-center gap-2">
              <FileText className="size-4" />
              All documents
            </span>
          </DropdownMenuCheckboxItem>

          <DropdownMenuSeparator />

          {/* Individual Documents */}
          <div className="max-h-50 overflow-y-auto">
            {documents.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No documents available
              </div>
            ) : (
              documents.map((doc) => (
                <DropdownMenuCheckboxItem
                  key={doc.id}
                  checked={selectedIds.includes(doc.id)}
                  onCheckedChange={() => handleToggleDocument(doc.id)}
                >
                  <span className="truncate">{doc.title}</span>
                </DropdownMenuCheckboxItem>
              ))
            )}
          </div>

          {selectedCount > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs justify-center"
                  onClick={handleClearSelection}
                >
                  <X className="size-3 mr-1" />
                  Clear selection
                </Button>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Selected Document Badges (optional) */}
      {!isAllSelected && selectedCount <= 2 && (
        <div className="flex items-center gap-1 overflow-hidden">
          {getSelectedDocumentNames().map((name) => (
            <Badge key={name} variant="secondary" className="text-[10px] truncate max-w-25">
              {name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
