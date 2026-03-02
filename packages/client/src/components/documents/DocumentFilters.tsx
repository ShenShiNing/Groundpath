import { Search, Filter, X } from 'lucide-react';
import type { DocumentType } from '@knowledge-agent/shared/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from 'react-i18next';

interface DocumentFiltersProps {
  search: string;
  onSearchChange: (search: string) => void;
  documentType: DocumentType | undefined;
  onDocumentTypeChange: (type: DocumentType | undefined) => void;
  sortBy: 'createdAt' | 'updatedAt' | 'title' | 'fileSize';
  onSortByChange: (sortBy: 'createdAt' | 'updatedAt' | 'title' | 'fileSize') => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (sortOrder: 'asc' | 'desc') => void;
  onClearFilters?: () => void;
}

const documentTypeValues: DocumentType[] = ['pdf', 'markdown', 'text', 'docx'];

const sortByValues = ['createdAt', 'updatedAt', 'title', 'fileSize'] as const;

export function DocumentFilters({
  search,
  onSearchChange,
  documentType,
  onDocumentTypeChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  onClearFilters,
}: DocumentFiltersProps) {
  const { t } = useTranslation('document');
  const hasFilters = search || documentType;

  const documentTypeLabels: Record<DocumentType, string> = {
    pdf: 'PDF',
    markdown: 'Markdown',
    text: t('type.text'),
    docx: t('type.docx'),
    other: t('type.other'),
  };

  const sortByLabels: Record<string, string> = {
    createdAt: t('filter.sortCreated'),
    updatedAt: t('filter.sortModified'),
    title: t('filter.sortTitle'),
    fileSize: t('filter.sortSize'),
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      <div className="relative flex-1 w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('filter.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select
          value={documentType ?? 'all'}
          onValueChange={(value) =>
            onDocumentTypeChange(value === 'all' ? undefined : (value as DocumentType))
          }
        >
          <SelectTrigger className="w-35">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder={t('filter.typePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filter.allTypes')}</SelectItem>
            {documentTypeValues.map((value) => (
              <SelectItem key={value} value={value}>
                {documentTypeLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sortBy}
          onValueChange={(value) =>
            onSortByChange(value as 'createdAt' | 'updatedAt' | 'title' | 'fileSize')
          }
        >
          <SelectTrigger className="w-37.5">
            <SelectValue placeholder={t('filter.sortCreated')} />
          </SelectTrigger>
          <SelectContent>
            {sortByValues.map((value) => (
              <SelectItem key={value} value={value}>
                {sortByLabels[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sortOrder}
          onValueChange={(value) => onSortOrderChange(value as 'asc' | 'desc')}
        >
          <SelectTrigger className="w-30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">{t('filter.newestFirst')}</SelectItem>
            <SelectItem value="asc">{t('filter.oldestFirst')}</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && onClearFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="h-4 w-4 mr-1" />
            {t('filter.clear')}
          </Button>
        )}
      </div>
    </div>
  );
}
