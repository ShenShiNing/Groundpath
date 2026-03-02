import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  CirclePlus,
  Database,
  FileText,
  Layers,
  LayoutGrid,
  List,
  Plus,
  Search,
  MoreHorizontal,
  Sparkles,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useKnowledgeBases, useDeleteKnowledgeBase } from '@/hooks';
import { KnowledgeBaseDialog } from '@/components/knowledge-bases';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { KnowledgeBaseListItem } from '@knowledge-agent/shared/types';
import type { TFunction } from 'i18next';

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'grid' | 'table';

// ============================================================================
// Helpers
// ============================================================================

function formatTimeAgo(date: Date, t: TFunction<'knowledgeBase'>): string {
  const now = new Date();
  const dateObj = new Date(date);
  const seconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (seconds < 60) return t('time.justNow');
  if (seconds < 3600) return t('time.minutesAgo', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('time.hoursAgo', { count: Math.floor(seconds / 3600) });
  if (seconds < 604800) return t('time.daysAgo', { count: Math.floor(seconds / 86400) });
  if (seconds < 2592000) return t('time.weeksAgo', { count: Math.floor(seconds / 604800) });
  return dateObj.toLocaleDateString();
}

const iconColorVariants = [
  { bg: 'bg-primary/10', text: 'text-primary' },
  { bg: 'bg-secondary', text: 'text-secondary-foreground' },
  { bg: 'bg-muted', text: 'text-foreground' },
  { bg: 'bg-accent', text: 'text-accent-foreground' },
];

function getIconColors(id: string) {
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return iconColorVariants[hash % iconColorVariants.length]!;
}

function KnowledgeBaseGridCard({
  knowledgeBase,
  onEdit,
  onDelete,
  t,
}: {
  knowledgeBase: KnowledgeBaseListItem;
  onEdit: () => void;
  onDelete: () => void;
  t: TFunction<'knowledgeBase'>;
}) {
  const iconColors = getIconColors(knowledgeBase.id);

  return (
    <Link
      to="/knowledge-bases/$id"
      params={{ id: knowledgeBase.id }}
      className={cn(
        'group flex min-h-44 flex-col rounded-2xl border bg-card/80 p-5',
        'transition-colors duration-200 hover:bg-accent/40 cursor-pointer'
      )}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className={cn('size-10 rounded-lg flex items-center justify-center', iconColors.bg)}>
          <Layers className={cn('size-5', iconColors.text)} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.preventDefault()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                onEdit();
              }}
            >
              {t('common:edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
            >
              {t('common:delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3 className="mb-1 truncate text-base font-semibold">{knowledgeBase.name}</h3>
      {knowledgeBase.description && (
        <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
          {knowledgeBase.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <FileText className="size-3.5" />
            {knowledgeBase.documentCount}
          </span>
          <span className="flex items-center gap-1">
            <Layers className="size-3.5" />
            {knowledgeBase.totalChunks}
          </span>
        </div>
        <span className="flex items-center gap-1">
          {formatTimeAgo(knowledgeBase.updatedAt, t)}
          <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </div>
    </Link>
  );
}

function KnowledgeBaseTableRow({
  knowledgeBase,
  onEdit,
  onDelete,
  t,
}: {
  knowledgeBase: KnowledgeBaseListItem;
  onEdit: () => void;
  onDelete: () => void;
  t: TFunction<'knowledgeBase'>;
}) {
  const iconColors = getIconColors(knowledgeBase.id);

  return (
    <TableRow className="group hover:bg-muted/40">
      <TableCell className="py-3">
        <Link
          to="/knowledge-bases/$id"
          params={{ id: knowledgeBase.id }}
          className="flex items-center gap-3 hover:underline cursor-pointer"
        >
          <div
            className={cn(
              'size-8 rounded-md flex items-center justify-center shrink-0',
              iconColors.bg
            )}
          >
            <Layers className={cn('size-4', iconColors.text)} />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{knowledgeBase.name}</p>
            {knowledgeBase.description && (
              <p className="text-xs text-muted-foreground truncate max-w-md">
                {knowledgeBase.description}
              </p>
            )}
          </div>
        </Link>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{knowledgeBase.documentCount}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{knowledgeBase.totalChunks}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatTimeAgo(knowledgeBase.updatedAt, t)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 cursor-pointer opacity-0 transition-opacity group-hover:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
              {t('common:edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="cursor-pointer" onClick={onDelete}>
              {t('common:delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function EmptyState({
  onCreateNew,
  t,
}: {
  onCreateNew: () => void;
  t: TFunction<'knowledgeBase'>;
}) {
  return (
    <div className="rounded-2xl border border-dashed px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
        <Database className="size-6 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-lg font-semibold">{t('empty.title')}</h3>
      <p className="mx-auto mb-5 max-w-sm text-sm text-muted-foreground">
        {t('empty.description')}
      </p>
      <Button className="cursor-pointer" onClick={onCreateNew}>
        <Plus className="size-4 mr-2" />
        {t('action.create')}
      </Button>
    </div>
  );
}

function NoResultsState({
  search,
  onClear,
  t,
}: {
  search: string;
  onClear: () => void;
  t: TFunction<'knowledgeBase'>;
}) {
  return (
    <div className="rounded-2xl border px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
        <Search className="size-6 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-lg font-semibold">{t('noResults.title')}</h3>
      <p className="mb-5 text-sm text-muted-foreground">{t('noResults.description', { search })}</p>
      <Button variant="outline" className="cursor-pointer" onClick={onClear}>
        {t('action.clearSearch')}
      </Button>
    </div>
  );
}

function CreateKnowledgeBaseCard({
  onCreate,
  t,
}: {
  onCreate: () => void;
  t: TFunction<'knowledgeBase'>;
}) {
  return (
    <button
      onClick={onCreate}
      className={cn(
        'flex min-h-44 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed',
        'cursor-pointer transition-colors duration-200 hover:border-primary hover:bg-accent/40'
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-xl bg-muted">
        <CirclePlus className="size-5 text-muted-foreground" />
      </div>
      <span className="text-sm font-medium">{t('action.createNew')}</span>
    </button>
  );
}

export default function KnowledgeBasesPage() {
  const { t } = useTranslation(['knowledgeBase', 'common']);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKB, setEditingKB] = useState<KnowledgeBaseListItem | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');

  const { data: knowledgeBases = [], isLoading } = useKnowledgeBases();
  const deleteMutation = useDeleteKnowledgeBase();
  const normalizedSearch = search.trim().toLowerCase();

  const filteredKBs = knowledgeBases.filter((kb) => {
    if (!normalizedSearch) return true;
    return (
      kb.name.toLowerCase().includes(normalizedSearch) ||
      kb.description?.toLowerCase().includes(normalizedSearch)
    );
  });
  const totalDocuments = knowledgeBases.reduce((sum, kb) => sum + kb.documentCount, 0);
  const totalChunks = knowledgeBases.reduce((sum, kb) => sum + kb.totalChunks, 0);
  const hasSearch = normalizedSearch.length > 0;

  const handleEdit = (kb: KnowledgeBaseListItem) => {
    setEditingKB(kb);
    setDialogOpen(true);
  };

  const handleDelete = async (kb: KnowledgeBaseListItem) => {
    try {
      await deleteMutation.mutateAsync(kb.id);
      toast.success(t('toast.deleted'));
    } catch {
      toast.error(t('toast.deleteFailed'));
    }
  };

  const handleCreateNew = () => {
    setEditingKB(undefined);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingKB(undefined);
  };

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 border-b px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
                <span>{t('breadcrumb.workspace')}</span>
                <ChevronRight className="size-4" />
                <span className="text-foreground">{t('breadcrumb.knowledgeBases')}</span>
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {t('page.title')}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('page.description')}
              </p>
            </div>
            <Button className="cursor-pointer" onClick={handleCreateNew}>
              <Plus className="size-4 mr-2" />
              {t('action.createNew')}
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('stats.totalKB')}</span>
              <span className="font-display text-lg font-semibold">{knowledgeBases.length}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('stats.totalDocs')}</span>
              <span className="font-display text-lg font-semibold">{totalDocuments}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('stats.totalChunks')}</span>
              <span className="font-display text-lg font-semibold">{totalChunks}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 bg-background pl-9"
                placeholder={t('search.placeholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-md border bg-background p-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-8 w-8 cursor-pointer rounded-sm',
                    viewMode === 'grid' && 'bg-muted'
                  )}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-8 w-8 cursor-pointer rounded-sm',
                    viewMode === 'table' && 'bg-muted'
                  )}
                  onClick={() => setViewMode('table')}
                  aria-label="Table view"
                >
                  <List className="size-4" />
                </Button>
              </div>
              <Button variant="outline" className="cursor-pointer" asChild>
                <Link to="/dashboard">
                  <Sparkles className="size-4 mr-2" />
                  {t('action.backToDashboard')}
                </Link>
              </Button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Database className="size-3.5" />
              {t('stats.results', { count: filteredKBs.length })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-3.5" />
              {t('stats.documents', { count: totalDocuments })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              {t('stats.autoSync')}
            </span>
          </div>

          {isLoading ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-44 rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            )
          ) : filteredKBs.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <CreateKnowledgeBaseCard onCreate={handleCreateNew} t={t} />
                {filteredKBs.map((kb) => (
                  <KnowledgeBaseGridCard
                    key={kb.id}
                    knowledgeBase={kb}
                    onEdit={() => handleEdit(kb)}
                    onDelete={() => handleDelete(kb)}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="font-medium">{t('table.name')}</TableHead>
                      <TableHead className="w-28 font-medium">{t('table.documents')}</TableHead>
                      <TableHead className="w-28 font-medium">{t('table.chunks')}</TableHead>
                      <TableHead className="w-32 font-medium">{t('table.updatedAt')}</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredKBs.map((kb) => (
                      <KnowledgeBaseTableRow
                        key={kb.id}
                        knowledgeBase={kb}
                        onEdit={() => handleEdit(kb)}
                        onDelete={() => handleDelete(kb)}
                        t={t}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : hasSearch && knowledgeBases.length > 0 ? (
            <NoResultsState search={search} onClear={() => setSearch('')} t={t} />
          ) : (
            <EmptyState onCreateNew={handleCreateNew} t={t} />
          )}
        </div>
      </div>

      <KnowledgeBaseDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        knowledgeBase={editingKB}
      />
    </AppLayout>
  );
}
