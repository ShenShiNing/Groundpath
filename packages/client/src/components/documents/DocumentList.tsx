import { useState } from 'react';
import { LayoutGrid, List, Loader2 } from 'lucide-react';
import type { DocumentListItem } from '@groundpath/shared/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DocumentCard } from './DocumentCard';
import { useTranslation } from 'react-i18next';

interface DocumentListProps {
  documents: DocumentListItem[];
  isLoading?: boolean;
  onEdit?: (document: DocumentListItem) => void;
  onDelete?: (document: DocumentListItem) => void;
  onMove?: (document: DocumentListItem) => void;
  className?: string;
}

type ViewMode = 'grid' | 'list';

export function DocumentList({
  documents,
  isLoading,
  onEdit,
  onDelete,
  onMove,
  className,
}: DocumentListProps) {
  const { t } = useTranslation('document');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('list.empty')}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex justify-end mb-4">
        <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('grid')}
            aria-label={t('list.view.grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('list')}
            aria-label={t('list.view.list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-2'
        )}
      >
        {documents.map((document) => (
          <DocumentCard
            key={document.id}
            document={document}
            onEdit={onEdit}
            onDelete={onDelete}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  );
}
