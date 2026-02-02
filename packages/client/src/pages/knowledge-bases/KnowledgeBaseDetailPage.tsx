import { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import {
  MessageSquare,
  Settings,
  Layers,
  FileText,
  ChevronRight,
  ArrowLeft,
  Upload,
  FolderPlus,
  LayoutGrid,
  List,
  Home,
  MoreHorizontal,
  Trash2,
  Pencil,
  Download,
  Search,
  Folder,
  ChevronDown,
  X,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useKnowledgeBase, useKBFolderTree, useKBDocuments, useDeleteDocument } from '@/hooks';
import { KnowledgeBaseDialog, ChatPanel } from '@/components/knowledge-bases';
import { ProcessingStatusBadge } from '@/components/knowledge-bases/documents/ProcessingStatusBadge';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { FolderDialog } from '@/components/documents/FolderDialog';
import { queryKeys } from '@/lib/queryClient';
import { formatBytes, cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useChatPanelStore } from '@/stores';
import type {
  FolderTreeNode,
  DocumentListItem,
  FolderInfo,
  DocumentType,
} from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'grid' | 'table';

interface DeleteDialogState {
  open: boolean;
  documents: DocumentListItem[];
}

// ============================================================================
// Helpers
// ============================================================================

function buildFolderPath(
  folderTree: FolderTreeNode[],
  targetId: string | null,
  path: FolderInfo[] = []
): FolderInfo[] {
  if (!targetId) return path;

  for (const folder of folderTree) {
    if (folder.id === targetId) {
      return [...path, folder];
    }
    const found = buildFolderPath(folder.children, targetId, [...path, folder]);
    if (found.length > path.length + 1 || found[found.length - 1]?.id === targetId) {
      return found;
    }
  }
  return path;
}

const documentTypeConfig: Record<DocumentType, { color: string; bgColor: string }> = {
  pdf: { color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-500/10' },
  markdown: {
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-500/10',
  },
  text: { color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-500/10' },
  docx: { color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-500/10' },
  other: { color: 'text-gray-500 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-400/10' },
};

// ============================================================================
// Folder Tree Item (for popover)
// ============================================================================

function FolderTreeItem({
  folder,
  level,
  currentFolderId,
  expandedIds,
  onSelect,
  onToggle,
}: {
  folder: FolderTreeNode;
  level: number;
  currentFolderId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const hasChildren = folder.children.length > 0;
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = currentFolderId === folder.id;

  return (
    <div>
      <button
        className={cn(
          'flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left',
          'hover:bg-accent',
          isSelected && 'bg-accent font-medium'
        )}
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn(
              'size-3.5 text-muted-foreground transition-transform shrink-0 cursor-pointer',
              isExpanded && 'rotate-90'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(folder.id);
            }}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Folder className="size-3.5 text-amber-500 shrink-0" />
        <span className="truncate">{folder.name}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {folder.documentCount}
        </span>
      </button>

      {isExpanded && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              level={level + 1}
              currentFolderId={currentFolderId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Document Grid Card
// ============================================================================

function DocumentGridCard({
  document,
  onSelect,
  onEdit,
  onDelete,
  onDownload,
}: {
  document: DocumentListItem;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const config = documentTypeConfig[document.documentType];

  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-xl border bg-card p-4',
        'hover:border-foreground/15 hover:shadow-sm',
        'transition-all duration-200 cursor-pointer'
      )}
      onClick={onSelect}
    >
      {/* File icon + actions */}
      <div className="flex items-start justify-between mb-3">
        <div className={cn('size-10 rounded-lg flex items-center justify-center', config.bgColor)}>
          <FileText className={cn('size-5', config.color)} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity -mr-1 -mt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="size-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
            >
              <Download className="size-4 mr-2" />
              Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Title */}
      <h4 className="font-medium text-sm leading-snug truncate mb-1.5" title={document.title}>
        {document.title}
      </h4>

      {/* Meta */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
        <span className="font-mono uppercase">{document.fileExtension}</span>
        <span className="text-muted-foreground/50">/</span>
        <span>{formatBytes(document.fileSize)}</span>
      </div>

      {/* Status */}
      <div className="mt-auto">
        <ProcessingStatusBadge status={document.processingStatus} />
      </div>
    </div>
  );
}

// ============================================================================
// Document Table Row
// ============================================================================

function DocumentTableRow({
  document,
  onSelect,
  onEdit,
  onDelete,
  onDownload,
}: {
  document: DocumentListItem;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const config = documentTypeConfig[document.documentType];

  return (
    <TableRow className="group cursor-pointer" onClick={onSelect}>
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
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="size-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDownload}>
              <Download className="size-4 mr-2" />
              Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function KnowledgeBaseDetailPage() {
  const { id } = useParams({ from: '/knowledge-bases/$id' });

  // UI State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [folderPopoverOpen, setFolderPopoverOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    documents: [],
  });

  // Chat panel store
  const { open: openChat, isOpen: isChatOpen } = useChatPanelStore();

  // Query client for manual invalidation
  const queryClient = useQueryClient();

  // Data
  const { data: knowledgeBase, isLoading: kbLoading } = useKnowledgeBase(id);
  const { data: folderTree } = useKBFolderTree(id);
  const { data: documentsResponse, isLoading: docsLoading } = useKBDocuments(id, {
    folderId: currentFolderId,
    pageSize: 100,
  });

  // Mutations
  const deleteDocumentMutation = useDeleteDocument();

  // Derived state
  const documents = useMemo(() => documentsResponse?.documents ?? [], [documentsResponse]);

  const filteredDocuments = useMemo(() => {
    if (!search) return documents;
    const searchLower = search.toLowerCase();
    return documents.filter((doc) => doc.title.toLowerCase().includes(searchLower));
  }, [documents, search]);

  const folderPath = useMemo(() => {
    if (!folderTree || !currentFolderId) return [];
    return buildFolderPath(folderTree, currentFolderId);
  }, [folderTree, currentFolderId]);

  const currentFolderName = useMemo(() => {
    if (!currentFolderId) return 'All Documents';
    const last = folderPath[folderPath.length - 1];
    return last?.name ?? 'All Documents';
  }, [currentFolderId, folderPath]);

  // Handlers
  const handleUploadSuccess = useCallback(() => {
    setUploadOpen(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.documents(id, {}) });
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.detail(id) });
  }, [id, queryClient]);

  const handleDocumentClick = useCallback((doc: DocumentListItem) => {
    window.location.href = `/documents/${doc.id}`;
  }, []);

  const handleFolderSelect = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSearch('');
    setFolderPopoverOpen(false);
  }, []);

  const handleFolderToggle = useCallback((folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleFolderNavigate = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSearch('');
  }, []);

  const handleDeleteDocument = useCallback((doc: DocumentListItem) => {
    setDeleteDialog({ open: true, documents: [doc] });
  }, []);

  const confirmDelete = useCallback(async () => {
    const { documents: docsToDelete } = deleteDialog;
    if (docsToDelete.length === 0) return;

    try {
      await Promise.all(docsToDelete.map((doc) => deleteDocumentMutation.mutateAsync(doc.id)));
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.documents(id, {}) });
      queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.detail(id) });
    } catch (error) {
      console.error('Failed to delete documents:', error);
    } finally {
      setDeleteDialog({ open: false, documents: [] });
    }
  }, [deleteDialog, deleteDocumentMutation, id, queryClient]);

  const handleDownloadDocument = useCallback((doc: DocumentListItem) => {
    window.open(`/api/documents/${doc.id}/download`, '_blank');
  }, []);

  const handleOpenChat = useCallback(() => {
    openChat(id);
  }, [id, openChat]);

  const handleOpenDocumentFromChat = useCallback((documentId: string) => {
    window.location.href = `/documents/${documentId}`;
  }, []);

  // Loading state
  if (kbLoading) {
    return (
      <AppLayout>
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header skeleton */}
          <div className="px-6 py-4 border-b">
            <div className="flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
          {/* Toolbar skeleton */}
          <div className="px-6 py-3 border-b flex items-center gap-3">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-8 w-48 ml-auto" />
          </div>
          {/* Content skeleton */}
          <div className="flex-1 p-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {[...Array(12)].map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Not found state
  if (!knowledgeBase) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Knowledge base not found</h2>
            <p className="text-muted-foreground mb-4">
              The knowledge base you're looking for doesn't exist or you don't have access.
            </p>
            <Button asChild>
              <Link to="/knowledge-bases">Back to Knowledge Bases</Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ================================================================ */}
        {/* Page Header                                                      */}
        {/* ================================================================ */}
        <header className="px-6 py-3.5 border-b bg-background">
          <div className="flex items-center gap-3">
            {/* Back */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
                  <Link to="/knowledge-bases">
                    <ArrowLeft className="size-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back to Knowledge Bases</TooltipContent>
            </Tooltip>

            {/* KB identity */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <Layers className="size-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold truncate leading-tight">
                  {knowledgeBase.name}
                </h1>
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1">
                    <FileText className="size-3" />
                    {knowledgeBase.documentCount} docs
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers className="size-3" />
                    {knowledgeBase.totalChunks} chunks
                  </span>
                </div>
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Header actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isChatOpen ? 'secondary' : 'ghost'}
                    size="icon"
                    className="size-8"
                    onClick={handleOpenChat}
                  >
                    <MessageSquare className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Chat with KB</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setEditDialogOpen(true)}
                  >
                    <Settings className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </header>

        {/* ================================================================ */}
        {/* Toolbar                                                          */}
        {/* ================================================================ */}
        <div className="px-6 py-2.5 border-b bg-background flex items-center gap-2">
          {/* Folder selector + breadcrumb */}
          <div className="flex items-center gap-1.5 min-w-0">
            <Popover open={folderPopoverOpen} onOpenChange={setFolderPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-sm font-medium shrink-0"
                >
                  <Folder className="size-3.5 text-muted-foreground" />
                  {currentFolderName}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-1.5">
                <ScrollArea className="max-h-72">
                  <button
                    className={cn(
                      'flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left',
                      'hover:bg-accent',
                      currentFolderId === null && 'bg-accent font-medium'
                    )}
                    onClick={() => handleFolderSelect(null)}
                  >
                    <Home className="size-3.5" />
                    <span>All Documents</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {knowledgeBase.documentCount}
                    </span>
                  </button>

                  {folderTree && folderTree.length > 0 && (
                    <>
                      <Separator className="my-1" />
                      {folderTree.map((folder) => (
                        <FolderTreeItem
                          key={folder.id}
                          folder={folder}
                          level={0}
                          currentFolderId={currentFolderId}
                          expandedIds={expandedFolderIds}
                          onSelect={(folderId) => handleFolderSelect(folderId)}
                          onToggle={handleFolderToggle}
                        />
                      ))}
                    </>
                  )}

                  <Separator className="my-1" />
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => {
                      setFolderPopoverOpen(false);
                      setFolderDialogOpen(true);
                    }}
                  >
                    <FolderPlus className="size-3.5" />
                    <span>New Folder</span>
                  </button>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            {/* Breadcrumb trail (when inside a folder) */}
            {folderPath.length > 0 && (
              <nav className="flex items-center gap-0.5 text-sm text-muted-foreground min-w-0">
                <ChevronRight className="size-3.5 shrink-0" />
                <button
                  className="px-1.5 py-0.5 rounded hover:bg-accent hover:text-foreground transition-colors truncate"
                  onClick={() => handleFolderNavigate(null)}
                >
                  Root
                </button>
                {folderPath.slice(0, -1).map((folder) => (
                  <div key={folder.id} className="flex items-center gap-0.5 min-w-0">
                    <ChevronRight className="size-3.5 shrink-0" />
                    <button
                      className="px-1.5 py-0.5 rounded hover:bg-accent hover:text-foreground transition-colors truncate"
                      onClick={() => handleFolderNavigate(folder.id)}
                    >
                      {folder.name}
                    </button>
                  </div>
                ))}
              </nav>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch('')}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center border rounded-lg p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-7 w-7 rounded-md', viewMode === 'grid' && 'bg-muted')}
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Grid view</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-7 w-7 rounded-md', viewMode === 'table' && 'bg-muted')}
                  onClick={() => setViewMode('table')}
                >
                  <List className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Table view</TooltipContent>
            </Tooltip>
          </div>

          {/* Upload */}
          <Button size="sm" className="h-8" onClick={() => setUploadOpen(true)}>
            <Upload className="size-3.5 mr-1.5" />
            Upload
          </Button>
        </div>

        {/* ================================================================ */}
        {/* Document Content                                                 */}
        {/* ================================================================ */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            {/* Active filter indicator */}
            {search && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-sm text-muted-foreground">Searching for</span>
                <Badge variant="secondary" className="gap-1">
                  "{search}"
                  <button onClick={() => setSearch('')}>
                    <X className="size-3" />
                  </button>
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {filteredDocuments.length} result{filteredDocuments.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {docsLoading ? (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                  {[...Array(12)].map((_, i) => (
                    <Skeleton key={i} className="h-36 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              )
            ) : filteredDocuments.length > 0 ? (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                  {filteredDocuments.map((doc) => (
                    <DocumentGridCard
                      key={doc.id}
                      document={doc}
                      onSelect={() => handleDocumentClick(doc)}
                      onEdit={() => handleDocumentClick(doc)}
                      onDelete={() => handleDeleteDocument(doc)}
                      onDownload={() => handleDownloadDocument(doc)}
                    />
                  ))}
                </div>
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="font-medium">Name</TableHead>
                        <TableHead className="font-medium w-24">Type</TableHead>
                        <TableHead className="font-medium w-24">Size</TableHead>
                        <TableHead className="font-medium w-32">Status</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocuments.map((doc) => (
                        <DocumentTableRow
                          key={doc.id}
                          document={doc}
                          onSelect={() => handleDocumentClick(doc)}
                          onEdit={() => handleDocumentClick(doc)}
                          onDelete={() => handleDeleteDocument(doc)}
                          onDownload={() => handleDownloadDocument(doc)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="size-14 rounded-2xl bg-muted flex items-center justify-center mb-5">
                  <Upload className="size-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-base mb-1.5">
                  {search ? 'No documents found' : 'No documents yet'}
                </h3>
                <p className="text-sm text-muted-foreground mb-5 max-w-sm">
                  {search
                    ? `No documents match "${search}".`
                    : 'Upload files to get started with your knowledge base.'}
                </p>
                {search ? (
                  <Button variant="outline" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                ) : (
                  <Button onClick={() => setUploadOpen(true)}>
                    <Upload className="size-4 mr-2" />
                    Upload Documents
                  </Button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Panel */}
      <ChatPanel
        knowledgeBaseId={id}
        documents={documentsResponse?.documents ?? []}
        onOpenDocument={handleOpenDocumentFromChat}
      />

      {/* Upload Dialog */}
      {uploadOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-lg max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Upload Documents</h3>
              <Button variant="ghost" size="sm" onClick={() => setUploadOpen(false)}>
                Close
              </Button>
            </div>
            <DocumentUpload
              knowledgeBaseId={id}
              folderId={currentFolderId}
              onSuccess={handleUploadSuccess}
            />
          </div>
        </div>
      )}

      {/* Dialogs */}
      <KnowledgeBaseDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        knowledgeBase={knowledgeBase}
      />
      <FolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        knowledgeBaseId={id}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => !open && setDeleteDialog({ open: false, documents: [] })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteDialog.documents.length > 1 ? 'Documents' : 'Document'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.documents.length === 1 ? (
                <>
                  Are you sure you want to delete "{deleteDialog.documents[0]?.title}"? This action
                  cannot be undone.
                </>
              ) : (
                <>
                  Are you sure you want to delete {deleteDialog.documents.length} documents? This
                  action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
