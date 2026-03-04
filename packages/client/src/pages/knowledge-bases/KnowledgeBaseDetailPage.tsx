import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams, Link } from '@tanstack/react-router';
import {
  Settings,
  Layers,
  FileText,
  ArrowLeft,
  Upload,
  LayoutGrid,
  List,
  MoreHorizontal,
  Trash2,
  Pencil,
  Download,
  Search,
  X,
} from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useKnowledgeBase, useKBDocuments, useDeleteDocument } from '@/hooks';
import { KnowledgeBaseDialog, ChatPanel } from '@/components/knowledge-bases';
import { ProcessingStatusBadge } from '@/components/documents/ProcessingStatusBadge';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { queryKeys } from '@/lib/query';
import { formatBytes, cn, openInNewTab } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { DocumentListItem, DocumentType } from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'grid' | 'table';

interface DeleteDialogState {
  open: boolean;
  documents: DocumentListItem[];
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

export default function KnowledgeBaseDetailPage() {
  const { t } = useTranslation(['knowledgeBase', 'common']);
  const { id } = useParams({ from: '/knowledge-bases/$id' });
  const navigate = useNavigate();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    documents: [],
  });

  const queryClient = useQueryClient();

  const { data: knowledgeBase, isLoading: kbLoading } = useKnowledgeBase(id);
  const { data: documentsResponse, isLoading: docsLoading } = useKBDocuments(id, {
    pageSize: 100,
  });

  const deleteDocumentMutation = useDeleteDocument();

  const documents = useMemo(() => documentsResponse?.documents ?? [], [documentsResponse]);

  const filteredDocuments = useMemo(() => {
    if (!search) return documents;
    const searchLower = search.toLowerCase();
    return documents.filter((doc) => doc.title.toLowerCase().includes(searchLower));
  }, [documents, search]);

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
    } catch {
      // deletion failed — query will refetch
    } finally {
      setDeleteDialog({ open: false, documents: [] });
    }
  }, [deleteDialog, deleteDocumentMutation, id, queryClient]);

  const handleDownloadDocument = useCallback((doc: DocumentListItem) => {
    openInNewTab(`/api/documents/${doc.id}/download`);
  }, []);

  const handleOpenDocumentFromChat = useCallback(
    (documentId: string) => {
      void navigate({
        to: '/documents/$id',
        params: { id: documentId },
      });
    },
    [navigate]
  );

  if (kbLoading) {
    return (
      <>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="shrink-0 border-b px-6 py-5">
            <div className="flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
          <div className="shrink-0 border-b px-6 py-2.5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-8 w-48 ml-auto" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {[...Array(12)].map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!knowledgeBase) {
    return (
      <>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-xl p-8 text-center">
            <h2 className="mb-2 text-xl font-semibold">{t('detail.notFound.title')}</h2>
            <p className="mb-5 text-sm text-muted-foreground">{t('detail.notFound.description')}</p>
            <Button className="cursor-pointer" asChild>
              <Link to="/knowledge-bases">{t('detail.action.backToList')}</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b px-6 py-4">
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
              <TooltipContent>{t('detail.tooltip.backToList')}</TooltipContent>
            </Tooltip>

            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Layers className="size-4" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display truncate text-xl font-semibold leading-tight">
                  {knowledgeBase.name}
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">{t('detail.subtitle')}</p>
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
                <TooltipContent>{t('detail.tooltip.settings')}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3.5" />
              {t('detail.stats.documents', { count: knowledgeBase.documentCount })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" />
              {t('detail.stats.chunks', { count: knowledgeBase.totalChunks })}
            </span>
          </div>
        </header>

        <div className="shrink-0 border-b px-6 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="ml-auto flex items-center gap-2">
              <div className="relative w-52 max-w-[60vw]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-sm"
                  placeholder={t('detail.search.placeholder')}
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
                  <TooltipContent>{t('detail.view.grid')}</TooltipContent>
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
                  <TooltipContent>{t('detail.view.table')}</TooltipContent>
                </Tooltip>
              </div>

              <Button size="sm" className="h-8 cursor-pointer" onClick={() => setUploadOpen(true)}>
                <Upload className="size-3.5 mr-1.5" />
                {t('detail.action.upload')}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="px-6 py-5">
              {search && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {t('detail.search.current')}
                  </span>
                  <Badge variant="secondary" className="gap-1">
                    "{search}"
                    <button className="cursor-pointer" onClick={() => setSearch('')}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {t('detail.search.resultCount', { count: filteredDocuments.length })}
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
                          <TableHead className="font-medium">{t('detail.table.name')}</TableHead>
                          <TableHead className="font-medium w-24">
                            {t('detail.table.type')}
                          </TableHead>
                          <TableHead className="font-medium w-24">
                            {t('detail.table.size')}
                          </TableHead>
                          <TableHead className="font-medium w-32">
                            {t('detail.table.status')}
                          </TableHead>
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
                    {search ? t('detail.empty.noMatch') : t('detail.empty.noDocuments')}
                  </h3>
                  <p className="mb-5 max-w-sm text-sm text-muted-foreground">
                    {search
                      ? t('detail.empty.noMatchDescription', { search })
                      : t('detail.empty.noDocumentsDescription')}
                  </p>
                  {search ? (
                    <Button
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => setSearch('')}
                    >
                      {t('detail.action.clearSearch')}
                    </Button>
                  ) : (
                    <Button className="cursor-pointer" onClick={() => setUploadOpen(true)}>
                      <Upload className="size-4 mr-2" />
                      {t('detail.action.upload')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <ChatPanel
        knowledgeBaseId={id}
        documents={documentsResponse?.documents ?? []}
        onOpenDocument={handleOpenDocumentFromChat}
      />

      {uploadOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-lg max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t('detail.upload.title')}</h3>
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => setUploadOpen(false)}
              >
                {t('close', { ns: 'common' })}
              </Button>
            </div>
            <DocumentUpload knowledgeBaseId={id} onSuccess={handleUploadSuccess} />
          </div>
        </div>
      )}

      <KnowledgeBaseDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        knowledgeBase={knowledgeBase}
      />

      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => !open && setDeleteDialog({ open: false, documents: [] })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('detail.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.documents.length === 1 ? (
                <>
                  {t('detail.delete.confirmSingle', {
                    title: deleteDialog.documents[0]?.title ?? '',
                  })}
                </>
              ) : (
                <>{t('detail.delete.confirmMultiple', { count: deleteDialog.documents.length })}</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              {t('cancel', { ns: 'common' })}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="cursor-pointer"
              onClick={confirmDelete}
            >
              {t('delete', { ns: 'common' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
