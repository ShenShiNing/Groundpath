import { LayoutGrid, List, Search, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { ViewMode } from './types';

interface KnowledgeBaseDocumentsToolbarProps {
  search: string;
  viewMode: ViewMode;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onViewModeChange: (viewMode: ViewMode) => void;
  onOpenUpload: () => void;
}

export function KnowledgeBaseDocumentsToolbar({
  search,
  viewMode,
  onSearchChange,
  onClearSearch,
  onViewModeChange,
  onOpenUpload,
}: KnowledgeBaseDocumentsToolbarProps) {
  const { t } = useTranslation('knowledgeBase');

  return (
    <div className="shrink-0 border-b px-6 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="ml-auto flex items-center gap-2">
          <div className="relative w-52 max-w-[60vw]">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder={t('detail.search.placeholder')}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            {search && (
              <button
                type="button"
                aria-label={t('detail.action.clearSearch')}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                onClick={onClearSearch}
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
                  onClick={() => onViewModeChange('grid')}
                  aria-label={t('detail.view.grid')}
                  aria-pressed={viewMode === 'grid'}
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
                  onClick={() => onViewModeChange('table')}
                  aria-label={t('detail.view.table')}
                  aria-pressed={viewMode === 'table'}
                >
                  <List className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('detail.view.table')}</TooltipContent>
            </Tooltip>
          </div>

          <Button size="sm" className="h-8 cursor-pointer" onClick={onOpenUpload}>
            <Upload className="mr-1.5 size-3.5" />
            {t('detail.action.upload')}
          </Button>
        </div>
      </div>
    </div>
  );
}
