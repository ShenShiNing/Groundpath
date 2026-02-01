import { LayoutGrid, List, FolderPlus, Upload, ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DocumentCard } from './DocumentCard';
import { DocumentTable } from './DocumentTable';
import { BatchActionBar } from './BatchActionBar';
import type { DocumentListItem, FolderInfo } from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

export type ViewMode = 'grid' | 'table';

export interface DocumentContentProps {
  knowledgeBaseId: string;
  documents: DocumentListItem[];
  currentFolder: FolderInfo | null;
  folderPath: FolderInfo[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onDocumentClick: (doc: DocumentListItem) => void;
  onFolderNavigate: (folderId: string | null) => void;
  onUpload: () => void;
  onNewFolder: () => void;
  onEditDocument?: (doc: DocumentListItem) => void;
  onDeleteDocument?: (doc: DocumentListItem) => void;
  onMoveDocument?: (doc: DocumentListItem) => void;
  onDownloadDocument?: (doc: DocumentListItem) => void;
  onBatchDelete?: () => void;
  onBatchMove?: () => void;
  onBatchReprocess?: () => void;
  isLoading?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function DocumentContent({
  documents,
  currentFolder,
  folderPath,
  viewMode,
  onViewModeChange,
  selectedIds,
  onSelectionChange,
  onDocumentClick,
  onFolderNavigate,
  onUpload,
  onNewFolder,
  onEditDocument,
  onDeleteDocument,
  onMoveDocument,
  onDownloadDocument,
  onBatchDelete,
  onBatchMove,
  onBatchReprocess,
  isLoading,
}: DocumentContentProps) {
  const isMultiSelectMode = selectedIds.size > 0;

  const handleCheckboxChange = (id: string, checked: boolean) => {
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    onSelectionChange(newSelection);
  };

  const handleClearSelection = () => {
    onSelectionChange(new Set());
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm">
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            onClick={() => onFolderNavigate(null)}
          >
            <Home className="size-4" />
            <span>Root</span>
          </button>

          {folderPath.map((folder, index) => (
            <div key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="size-4 text-muted-foreground" />
              <button
                className={cn(
                  'px-2 py-1 rounded-md transition-colors',
                  index === folderPath.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
                onClick={() => onFolderNavigate(folder.id)}
              >
                {folder.name}
              </button>
            </div>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center border rounded-lg p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-7 w-7 rounded-md', viewMode === 'grid' && 'bg-muted')}
              onClick={() => onViewModeChange('grid')}
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-7 w-7 rounded-md', viewMode === 'table' && 'bg-muted')}
              onClick={() => onViewModeChange('table')}
            >
              <List className="size-4" />
            </Button>
          </div>

          <div className="h-5 w-px bg-border" />

          <Button variant="outline" size="sm" onClick={onNewFolder}>
            <FolderPlus className="size-4 mr-1.5" />
            New Folder
          </Button>

          <Button size="sm" onClick={onUpload}>
            <Upload className="size-4 mr-1.5" />
            Upload
          </Button>
        </div>
      </div>

      {/* Batch Action Bar */}
      {isMultiSelectMode && onBatchDelete && onBatchMove && (
        <BatchActionBar
          selectedCount={selectedIds.size}
          onDelete={onBatchDelete}
          onMove={onBatchMove}
          onReprocess={onBatchReprocess}
          onClearSelection={handleClearSelection}
        />
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  isSelected={selectedIds.has(doc.id)}
                  isMultiSelectMode={isMultiSelectMode}
                  onSelect={() => onDocumentClick(doc)}
                  onCheckboxChange={(checked) => handleCheckboxChange(doc.id, checked)}
                  onEdit={onEditDocument ? () => onEditDocument(doc) : undefined}
                  onDelete={onDeleteDocument ? () => onDeleteDocument(doc) : undefined}
                  onMove={onMoveDocument ? () => onMoveDocument(doc) : undefined}
                  onDownload={onDownloadDocument ? () => onDownloadDocument(doc) : undefined}
                />
              ))}
            </div>
          ) : (
            <DocumentTable
              documents={documents}
              selectedIds={selectedIds}
              onSelectionChange={onSelectionChange}
              onDocumentClick={onDocumentClick}
              onEdit={onEditDocument}
              onDelete={onDeleteDocument}
              onMove={onMoveDocument}
              onDownload={onDownloadDocument}
            />
          )}

          {/* Empty State */}
          {!isLoading && documents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Upload className="size-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">
                {currentFolder ? 'This folder is empty' : 'No documents yet'}
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                Upload files to get started with your knowledge base
              </p>
              <Button onClick={onUpload}>
                <Upload className="size-4 mr-2" />
                Upload Documents
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
