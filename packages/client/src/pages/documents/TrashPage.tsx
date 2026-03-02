import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, CalendarClock, RotateCcw, Search, Trash, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TrashDocumentListItem } from '@knowledge-agent/shared/types';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTrashDocuments, useRestoreDocument, usePermanentDeleteDocument } from '@/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatBytes } from '@/lib/utils';

export function TrashPage() {
  const { t } = useTranslation(['document', 'common']);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'deletedAt' | 'title' | 'fileSize'>('deletedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<TrashDocumentListItem | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const queryParams = useMemo(
    () => ({
      page: 1,
      pageSize: 20,
      search: debouncedSearch || undefined,
      sortBy,
      sortOrder,
    }),
    [debouncedSearch, sortBy, sortOrder]
  );

  const { data: trashData, isLoading } = useTrashDocuments(queryParams);
  const restoreMutation = useRestoreDocument();
  const permanentDeleteMutation = usePermanentDeleteDocument();

  const trashDocuments = trashData?.documents ?? [];
  const pagination = trashData?.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 0 };
  const currentPageSize = trashDocuments.reduce((sum, doc) => sum + doc.fileSize, 0);

  const handleRestore = (document: TrashDocumentListItem) => {
    setSelectedDocument(document);
    setRestoreDialogOpen(true);
  };

  const confirmRestore = async () => {
    if (!selectedDocument) return;
    try {
      await restoreMutation.mutateAsync(selectedDocument.id);
      toast.success(t('trash.toast.restored'));
    } catch {
      toast.error(t('trash.toast.restoreFailed'));
    }
    setRestoreDialogOpen(false);
    setSelectedDocument(null);
  };

  const handlePermanentDelete = (document: TrashDocumentListItem) => {
    setSelectedDocument(document);
    setDeleteDialogOpen(true);
  };

  const confirmPermanentDelete = async () => {
    if (!selectedDocument) return;
    try {
      await permanentDeleteMutation.mutateAsync(selectedDocument.id);
      toast.success(t('trash.toast.permanentlyDeleted'));
    } catch {
      toast.error(t('trash.toast.deleteFailed'));
    }
    setDeleteDialogOpen(false);
    setSelectedDocument(null);
  };

  const handleClearFilters = () => {
    setSearch('');
    setSortBy('deletedAt');
    setSortOrder('desc');
  };

  return (
    <AppLayout>
      <div className="relative flex-1 overflow-y-auto bg-background px-6 py-8 md:py-10">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-72 w-152 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="mx-auto w-full max-w-6xl space-y-6">
          <section className="rounded-2xl border bg-card/70 p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                  {t('trash.page.title')}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">{t('trash.page.description')}</p>
              </div>
              <Button variant="outline" className="cursor-pointer" asChild>
                <Link to="/knowledge-bases">
                  {t('trash.action.backToKnowledgeBases')}
                  <ArrowUpRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">{t('trash.stats.total')}</p>
                <p className="mt-2 font-display text-2xl font-semibold">{pagination.total}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">{t('trash.stats.currentPage')}</p>
                <p className="mt-2 font-display text-2xl font-semibold">{trashDocuments.length}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="text-xs text-muted-foreground">{t('trash.stats.currentPageSize')}</p>
                <p className="mt-2 font-display text-2xl font-semibold">
                  {formatBytes(currentPageSize)}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  className="h-10 bg-background pl-9"
                  placeholder={t('trash.search.placeholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto">
                <Select
                  value={sortBy}
                  onValueChange={(value: 'deletedAt' | 'title' | 'fileSize') => setSortBy(value)}
                >
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder={t('trash.sort.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deletedAt">{t('trash.sort.deletedAt')}</SelectItem>
                    <SelectItem value="title">{t('trash.sort.title')}</SelectItem>
                    <SelectItem value="fileSize">{t('trash.sort.fileSize')}</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={sortOrder}
                  onValueChange={(value: 'asc' | 'desc') => setSortOrder(value)}
                >
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">{t('trash.sort.desc')}</SelectItem>
                    <SelectItem value="asc">{t('trash.sort.asc')}</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" className="cursor-pointer" onClick={handleClearFilters}>
                  {t('trash.action.clearFilters')}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-background">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : trashDocuments.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
                    <Trash2 className="size-6 text-muted-foreground" />
                  </div>
                  <p className="mb-1 text-lg font-semibold">{t('trash.empty.title')}</p>
                  <p className="text-sm text-muted-foreground">{t('trash.empty.description')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="font-medium">{t('trash.table.name')}</TableHead>
                      <TableHead className="w-28 font-medium">{t('trash.table.type')}</TableHead>
                      <TableHead className="w-32 font-medium">
                        {t('trash.table.fileSize')}
                      </TableHead>
                      <TableHead className="w-40 font-medium">
                        {t('trash.table.deletedAt')}
                      </TableHead>
                      <TableHead className="w-48 text-right font-medium">
                        {t('trash.table.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashDocuments.map((doc) => (
                      <TableRow key={doc.id} className="hover:bg-muted/40">
                        <TableCell>
                          <p className="truncate font-medium">{doc.title}</p>
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">
                          {doc.documentType}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatBytes(doc.fileSize)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarClock className="size-3.5" />
                            {new Date(doc.deletedAt).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="cursor-pointer"
                              onClick={() => handleRestore(doc)}
                            >
                              <RotateCcw className="size-4 mr-1" />
                              {t('trash.action.restore')}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="cursor-pointer"
                              onClick={() => handlePermanentDelete(doc)}
                            >
                              <Trash className="size-4 mr-1" />
                              {t('trash.action.permanentDelete')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {pagination.total > 0 && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                {t('trash.pagination.showing', {
                  current: trashDocuments.length,
                  total: pagination.total,
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('trash.dialog.restore.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('trash.dialog.restore.description', { title: selectedDocument?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              {t('cancel', { ns: 'common' })}
            </AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={confirmRestore}>
              {t('trash.dialog.restore.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('trash.dialog.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('trash.dialog.delete.description', { title: selectedDocument?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              {t('cancel', { ns: 'common' })}
            </AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmPermanentDelete}
            >
              {t('trash.dialog.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

export default TrashPage;
