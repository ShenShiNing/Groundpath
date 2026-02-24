import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams, Link } from '@tanstack/react-router';
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
import { ProcessingStatusBadge } from '@/components/documents/ProcessingStatusBadge';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { FolderDialog } from '@/components/documents/FolderDialog';
import { queryKeys } from '@/lib/query';
import { formatBytes, cn, openInNewTab } from '@/lib/utils';
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
          'flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left cursor-pointer',
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
        'group relative flex flex-col rounded-2xl border bg-card/80 p-4',
        'hover:bg-accent/35 hover:border-foreground/15 hover:shadow-sm',
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
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
            >
              <Download className="size-4 mr-2" />
              下载
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
              删除
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
              编辑
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={onDownload}>
              <Download className="size-4 mr-2" />
              下载
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="cursor-pointer" onClick={onDelete}>
              <Trash2 className="size-4 mr-2" />
              删除
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
  const navigate = useNavigate();

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
    if (!currentFolderId) return '全部文档';
    const last = folderPath[folderPath.length - 1];
    return last?.name ?? '全部文档';
  }, [currentFolderId, folderPath]);

  // Handlers
  const handleUploadSuccess = useCallback(() => {
    setUploadOpen(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.documents(id, {}) });
    queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.detail(id) });
  }, [id, queryClient]);

  const handleDocumentClick = useCallback(
    (doc: DocumentListItem) => {
      void navigate({
        to: '/documents/$id',
        params: { id: doc.id },
      });
    },
    [navigate]
  );

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
    openInNewTab(`/api/documents/${doc.id}/download`);
  }, []);

  const handleOpenChat = useCallback(() => {
    openChat(id);
  }, [id, openChat]);

  const handleOpenDocumentFromChat = useCallback(
    (documentId: string) => {
      void navigate({
        to: '/documents/$id',
        params: { id: documentId },
      });
    },
    [navigate]
  );

  // Loading state
  if (kbLoading) {
    return (
      <AppLayout>
        <div className="flex-1 overflow-hidden bg-background px-4 py-4 md:px-6 md:py-5">
          <div className="flex h-full flex-col">
            <div className="rounded-2xl border bg-card/70 p-5">
              <div className="flex items-center gap-4">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-6 w-48" />
              </div>
            </div>
            <div className="mt-3 rounded-xl border bg-card p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-36" />
                <Skeleton className="h-8 w-48 ml-auto" />
              </div>
            </div>
            <div className="mt-3 flex-1 rounded-2xl border bg-card/70 p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                {[...Array(12)].map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-xl" />
                ))}
              </div>
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
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-xl rounded-2xl border bg-card/70 p-8 text-center">
            <h2 className="mb-2 text-xl font-semibold">知识库不存在</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              当前知识库可能已被删除，或你没有访问权限。
            </p>
            <Button className="cursor-pointer" asChild>
              <Link to="/knowledge-bases">返回知识库列表</Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="relative flex-1 overflow-hidden bg-background px-4 py-4 md:px-6 md:py-5">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-72 w-160 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="flex h-full flex-col">
          <header className="rounded-2xl border bg-card/70 p-4 md:p-5">
            <div className="flex flex-wrap items-start gap-3 md:gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 cursor-pointer"
                    asChild
                  >
                    <Link to="/knowledge-bases">
                      <ArrowLeft className="size-4" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>返回知识库列表</TooltipContent>
              </Tooltip>

              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Layers className="size-4" />
                </div>
                <div className="min-w-0">
                  <h1 className="font-display truncate text-xl font-semibold leading-tight">
                    {knowledgeBase.name}
                  </h1>
                  <p className="mt-1 text-xs text-muted-foreground">知识库详情与文档管理</p>
                </div>
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isChatOpen ? 'secondary' : 'ghost'}
                      size="icon"
                      className="size-8 cursor-pointer"
                      onClick={handleOpenChat}
                    >
                      <MessageSquare className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>打开知识库问答</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 cursor-pointer"
                      onClick={() => setEditDialogOpen(true)}
                    >
                      <Settings className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>知识库设置</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <FileText className="size-3.5" />
                {knowledgeBase.documentCount} 份文档
              </span>
              <span className="inline-flex items-center gap-1">
                <Layers className="size-3.5" />
                {knowledgeBase.totalChunks} 个 chunks
              </span>
            </div>
          </header>

          <div className="mt-3 rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Popover open={folderPopoverOpen} onOpenChange={setFolderPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 cursor-pointer gap-1.5 text-sm font-medium"
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
                          'flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left cursor-pointer',
                          'hover:bg-accent',
                          currentFolderId === null && 'bg-accent font-medium'
                        )}
                        onClick={() => handleFolderSelect(null)}
                      >
                        <Home className="size-3.5" />
                        <span>全部文档</span>
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
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                        onClick={() => {
                          setFolderPopoverOpen(false);
                          setFolderDialogOpen(true);
                        }}
                      >
                        <FolderPlus className="size-3.5" />
                        <span>新建文件夹</span>
                      </button>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>

                {folderPath.length > 0 && (
                  <nav className="flex min-w-0 items-center gap-0.5 text-sm text-muted-foreground">
                    <ChevronRight className="size-3.5 shrink-0" />
                    <button
                      className="truncate rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                      onClick={() => handleFolderNavigate(null)}
                    >
                      根目录
                    </button>
                    {folderPath.slice(0, -1).map((folder) => (
                      <div key={folder.id} className="flex min-w-0 items-center gap-0.5">
                        <ChevronRight className="size-3.5 shrink-0" />
                        <button
                          className="truncate rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
                          onClick={() => handleFolderNavigate(folder.id)}
                        >
                          {folder.name}
                        </button>
                      </div>
                    ))}
                  </nav>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <div className="relative w-52 max-w-[60vw]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-sm"
                    placeholder="搜索文档..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                      onClick={() => setSearch('')}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center rounded-lg border p-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-7 w-7 rounded-md cursor-pointer',
                          viewMode === 'grid' && 'bg-muted'
                        )}
                        onClick={() => setViewMode('grid')}
                      >
                        <LayoutGrid className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>卡片视图</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-7 w-7 rounded-md cursor-pointer',
                          viewMode === 'table' && 'bg-muted'
                        )}
                        onClick={() => setViewMode('table')}
                      >
                        <List className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>表格视图</TooltipContent>
                  </Tooltip>
                </div>

                <Button
                  size="sm"
                  className="h-8 cursor-pointer"
                  onClick={() => setUploadOpen(true)}
                >
                  <Upload className="size-3.5 mr-1.5" />
                  上传文档
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-3 flex-1 overflow-hidden rounded-2xl border bg-card/70">
            <ScrollArea className="h-full">
              <div className="p-5 md:p-6">
                {search && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">当前搜索</span>
                    <Badge variant="secondary" className="gap-1">
                      "{search}"
                      <button className="cursor-pointer" onClick={() => setSearch('')}>
                        <X className="size-3" />
                      </button>
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      共 {filteredDocuments.length} 条结果
                    </span>
                  </div>
                )}

                {docsLoading ? (
                  viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
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
                    <div className="overflow-hidden rounded-xl border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="font-medium">名称</TableHead>
                            <TableHead className="font-medium w-24">类型</TableHead>
                            <TableHead className="font-medium w-24">大小</TableHead>
                            <TableHead className="font-medium w-32">状态</TableHead>
                            <TableHead className="w-12" />
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
                    <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-muted">
                      <Upload className="size-6 text-muted-foreground" />
                    </div>
                    <h3 className="mb-1.5 text-base font-semibold">
                      {search ? '没有匹配的文档' : '知识库还没有文档'}
                    </h3>
                    <p className="mb-5 max-w-sm text-sm text-muted-foreground">
                      {search
                        ? `未找到与“${search}”相关的内容。`
                        : '上传文档后即可开始检索与问答。'}
                    </p>
                    {search ? (
                      <Button
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => setSearch('')}
                      >
                        清空搜索
                      </Button>
                    ) : (
                      <Button className="cursor-pointer" onClick={() => setUploadOpen(true)}>
                        <Upload className="size-4 mr-2" />
                        上传文档
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
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
              <h3 className="text-lg font-semibold">上传文档</h3>
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => setUploadOpen(false)}
              >
                关闭
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
              {deleteDialog.documents.length > 1 ? '删除文档' : '删除文档'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.documents.length === 1 ? (
                <>你确定要删除 “{deleteDialog.documents[0]?.title}” 吗？此操作不可撤销。</>
              ) : (
                <>你确定要删除 {deleteDialog.documents.length} 份文档吗？此操作不可撤销。</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="cursor-pointer"
              onClick={confirmDelete}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
