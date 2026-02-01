import { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import {
  MessageSquare,
  Settings,
  Layers,
  FileText,
  ChevronRight,
  ChevronLeft,
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
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
// Folder Tree Item Component
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
        style={{ paddingLeft: `${12 + level * 16}px` }}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn(
              'size-4 text-muted-foreground transition-transform shrink-0 cursor-pointer',
              isExpanded && 'rotate-90'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(folder.id);
            }}
          />
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <Folder className="size-4 text-amber-500 shrink-0" />
        <span className="truncate">{folder.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{folder.documentCount}</span>
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
// Document Grid Card Component
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
        'group flex flex-col p-4 rounded-lg border bg-card',
        'hover:bg-accent/50 transition-colors cursor-pointer'
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
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
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

      <h4 className="font-medium text-sm truncate mb-1" title={document.title}>
        {document.title}
      </h4>

      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span>{document.fileExtension.toUpperCase()}</span>
        <span>·</span>
        <span>{formatBytes(document.fileSize)}</span>
      </div>

      <div className="mt-auto pt-2">
        <ProcessingStatusBadge status={document.processingStatus} />
      </div>
    </div>
  );
}

// ============================================================================
// Document Table Row Component
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
      <TableCell className="text-sm text-muted-foreground">
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

  // Handlers
  const handleUploadSuccess = useCallback(() => {
    setUploadOpen(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.documents(id, {}) });
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.detail(id) });
  }, [id, queryClient]);

  const handleDocumentClick = useCallback((doc: DocumentListItem) => {
    window.location.href = `/documents/${doc.id}`;
  }, []);

  const handleFolderSelect = useCallback((folderId: string) => {
    setCurrentFolderId(folderId);
    setSearch('');
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
        <div className="flex-1 flex overflow-hidden">
          <aside className="w-60 flex-none border-r p-4 space-y-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-9 w-full" />
            <div className="space-y-2 pt-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </aside>
          <main className="flex-1 p-6">
            <Skeleton className="h-10 w-64 mb-6" />
            <div className="grid grid-cols-4 gap-4">
              <Skeleton className="h-32 rounded-lg" />
              <Skeleton className="h-32 rounded-lg" />
              <Skeleton className="h-32 rounded-lg" />
              <Skeleton className="h-32 rounded-lg" />
            </div>
          </main>
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
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Folder Tree */}
        <aside className="w-60 flex-none flex flex-col border-r bg-muted/20">
          {/* KB Header */}
          <div className="p-3 border-b">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="size-7 -ml-1" asChild>
                <Link to="/knowledge-bases">
                  <ChevronLeft className="size-4" />
                </Link>
              </Button>
              <div className="size-7 rounded-md bg-primary flex items-center justify-center">
                <Layers className="size-4 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-semibold truncate">{knowledgeBase.name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 ml-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileText className="size-3" />
                {knowledgeBase.documentCount}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="size-3" />
                {knowledgeBase.totalChunks}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="p-2 border-b space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="size-4 mr-2" />
              Upload
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setFolderDialogOpen(true)}
            >
              <FolderPlus className="size-4 mr-2" />
              New Folder
            </Button>
          </div>

          {/* Folder Tree */}
          <ScrollArea className="flex-1">
            <div className="p-2">
              <button
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left',
                  'hover:bg-accent',
                  currentFolderId === null && 'bg-accent font-medium'
                )}
                onClick={() => setCurrentFolderId(null)}
              >
                <Home className="size-4" />
                <span>All Documents</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {knowledgeBase.documentCount}
                </span>
              </button>

              {folderTree?.map((folder) => (
                <FolderTreeItem
                  key={folder.id}
                  folder={folder}
                  level={0}
                  currentFolderId={currentFolderId}
                  expandedIds={expandedFolderIds}
                  onSelect={handleFolderSelect}
                  onToggle={handleFolderToggle}
                />
              ))}
            </div>
          </ScrollArea>

          {/* Bottom Actions */}
          <div className="p-2 border-t space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setEditDialogOpen(true)}
            >
              <Settings className="size-4 mr-2" />
              Settings
            </Button>
            <Button
              variant={isChatOpen ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start"
              onClick={handleOpenChat}
            >
              <MessageSquare className="size-4 mr-2" />
              Chat
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-sm">
              <button
                className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                onClick={() => handleFolderNavigate(null)}
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
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    )}
                    onClick={() => handleFolderNavigate(folder.id)}
                  >
                    {folder.name}
                  </button>
                </div>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-8 text-sm"
                  placeholder="Search documents..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex items-center border rounded-md p-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn('h-7 w-7 rounded-sm', viewMode === 'grid' && 'bg-muted')}
                      onClick={() => setViewMode('grid')}
                    >
                      <LayoutGrid className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Grid view</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn('h-7 w-7 rounded-sm', viewMode === 'table' && 'bg-muted')}
                      onClick={() => setViewMode('table')}
                    >
                      <List className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Table view</TooltipContent>
                </Tooltip>
              </div>

              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="size-4 mr-2" />
                Upload
              </Button>
            </div>
          </div>

          {/* Document Content */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              {docsLoading ? (
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {[...Array(10)].map((_, i) => (
                      <Skeleton key={i} className="h-36 rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...Array(8)].map((_, i) => (
                      <Skeleton key={i} className="h-12 rounded-lg" />
                    ))}
                  </div>
                )
              ) : filteredDocuments.length > 0 ? (
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
                  <div className="border rounded-lg overflow-hidden">
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
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="size-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                    <Upload className="size-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium mb-1">
                    {search ? 'No documents found' : 'No documents yet'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-sm">
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
