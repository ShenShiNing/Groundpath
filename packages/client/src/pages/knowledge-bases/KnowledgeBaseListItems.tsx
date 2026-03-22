import { Link } from '@tanstack/react-router';
import {
  ArrowUpRight,
  CirclePlus,
  Database,
  FileText,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/date';
import type { KnowledgeBaseListItem } from '@groundpath/shared/types';
import type { TFunction } from 'i18next';

export type KnowledgeBasePageT = TFunction<['knowledgeBase', 'common']>;

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

export function KnowledgeBaseGridCard({
  knowledgeBase,
  onEdit,
  onDelete,
  t,
}: {
  knowledgeBase: KnowledgeBaseListItem;
  onEdit: () => void;
  onDelete: () => void;
  t: KnowledgeBasePageT;
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

export function KnowledgeBaseTableRow({
  knowledgeBase,
  onEdit,
  onDelete,
  t,
}: {
  knowledgeBase: KnowledgeBaseListItem;
  onEdit: () => void;
  onDelete: () => void;
  t: KnowledgeBasePageT;
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

export function EmptyState({ onCreateNew, t }: { onCreateNew: () => void; t: KnowledgeBasePageT }) {
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

export function NoResultsState({
  search,
  onClear,
  t,
}: {
  search: string;
  onClear: () => void;
  t: KnowledgeBasePageT;
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

export function CreateKnowledgeBaseCard({
  onCreate,
  t,
}: {
  onCreate: () => void;
  t: KnowledgeBasePageT;
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
