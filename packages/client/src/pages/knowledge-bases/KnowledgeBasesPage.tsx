import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Database, FileText, LayoutGrid, List, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useKnowledgeBases, useDeleteKnowledgeBase } from '@/hooks';
import { KnowledgeBaseDialog } from '@/components/knowledge-bases';
import { useVirtualGrid } from '@/hooks/useVirtualGrid';
import { useVirtualList } from '@/hooks/useVirtualList';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { KnowledgeBaseListItem } from '@groundpath/shared/types';
import {
  KnowledgeBaseGridCard,
  KnowledgeBaseTableRow,
  EmptyState,
  NoResultsState,
  CreateKnowledgeBaseCard,
  type KnowledgeBasePageT,
} from './KnowledgeBaseListItems';

type ViewMode = 'grid' | 'table';

const GRID_COLUMNS = {
  breakpoints: [
    [1280, 3], // xl
    [640, 2], // sm
  ] as [number, number][],
  default: 1,
};
const GRID_ROW_HEIGHT = 176; // min-h-44
const TABLE_ROW_HEIGHT = 56;

/* ------------------------------------------------------------------ */
/*  Virtual grid                                                      */
/* ------------------------------------------------------------------ */

function VirtualKBGrid({
  knowledgeBases,
  onEdit,
  onDelete,
  onCreate,
  t,
}: {
  knowledgeBases: KnowledgeBaseListItem[];
  onEdit: (kb: KnowledgeBaseListItem) => void;
  onDelete: (kb: KnowledgeBaseListItem) => void;
  onCreate: () => void;
  t: KnowledgeBasePageT;
}) {
  const items: (KnowledgeBaseListItem | null)[] = [null, ...knowledgeBases];
  const { parentRef, virtualizer, getRowItems, columnCount, gap } = useVirtualGrid({
    items,
    columns: GRID_COLUMNS,
    estimateRowHeight: GRID_ROW_HEIGHT,
    gap: 16,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto px-6 pb-6">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowItems = getRowItems(virtualRow.index);
          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 right-0"
              style={{
                top: virtualRow.start,
                height: virtualRow.size,
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                gap,
              }}
            >
              {rowItems.map((item) =>
                item === null ? (
                  <CreateKnowledgeBaseCard key="create" onCreate={onCreate} t={t} />
                ) : (
                  <KnowledgeBaseGridCard
                    key={item.id}
                    knowledgeBase={item}
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item)}
                    t={t}
                  />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Virtual table                                                     */
/* ------------------------------------------------------------------ */

function VirtualKBTable({
  knowledgeBases,
  onEdit,
  onDelete,
  t,
}: {
  knowledgeBases: KnowledgeBaseListItem[];
  onEdit: (kb: KnowledgeBaseListItem) => void;
  onDelete: (kb: KnowledgeBaseListItem) => void;
  t: KnowledgeBasePageT;
}) {
  const { parentRef, virtualizer } = useVirtualList({
    count: knowledgeBases.length,
    estimateSize: TABLE_ROW_HEIGHT,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1]!.end
      : 0;

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto px-6 pb-6">
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
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop, padding: 0, border: 'none' }} />
              </tr>
            )}
            {virtualItems.map((virtualRow) => {
              const kb = knowledgeBases[virtualRow.index]!;
              return (
                <KnowledgeBaseTableRow
                  key={kb.id}
                  knowledgeBase={kb}
                  onEdit={() => onEdit(kb)}
                  onDelete={() => onDelete(kb)}
                  t={t}
                />
              );
            })}
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: paddingBottom, padding: 0, border: 'none' }} />
              </tr>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

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
  const useVirtual = filteredKBs.length > 30;

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
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ---- Header ---- */}
        <header className="shrink-0 border-b px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {t('page.title')}
              </h1>
            </div>
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

        {/* ---- Toolbar (fixed) ---- */}
        <div className="shrink-0 px-6 pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-10 bg-background pl-9"
                  placeholder={t('search.placeholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button className="cursor-pointer" onClick={handleCreateNew}>
                <Plus className="size-4 mr-2" />
                {t('action.createNew')}
              </Button>
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
                  aria-label={t('view.grid')}
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
                  aria-label={t('view.table')}
                >
                  <List className="size-4" />
                </Button>
              </div>
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
        </div>

        {/* ---- Content (scrollable) ---- */}
        {isLoading ? (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {viewMode === 'grid' ? (
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
            )}
          </div>
        ) : filteredKBs.length > 0 ? (
          useVirtual ? (
            viewMode === 'grid' ? (
              <VirtualKBGrid
                knowledgeBases={filteredKBs}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onCreate={handleCreateNew}
                t={t}
              />
            ) : (
              <VirtualKBTable
                knowledgeBases={filteredKBs}
                onEdit={handleEdit}
                onDelete={handleDelete}
                t={t}
              />
            )
          ) : viewMode === 'grid' ? (
            <div className="flex-1 overflow-y-auto px-6 pb-6">
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
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 pb-6">
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
            </div>
          )
        ) : hasSearch && knowledgeBases.length > 0 ? (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <NoResultsState search={search} onClear={() => setSearch('')} t={t} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <EmptyState onCreateNew={handleCreateNew} t={t} />
          </div>
        )}
      </div>

      <KnowledgeBaseDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        knowledgeBase={editingKB}
      />
    </>
  );
}
