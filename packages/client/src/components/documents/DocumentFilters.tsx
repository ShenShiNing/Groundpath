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

const documentTypeOptions: { value: DocumentType; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'text', label: 'Text' },
  { value: 'docx', label: 'Word Document' },
];

const sortByOptions = [
  { value: 'createdAt', label: 'Date Created' },
  { value: 'updatedAt', label: 'Date Modified' },
  { value: 'title', label: 'Title' },
  { value: 'fileSize', label: 'File Size' },
];

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
  const hasFilters = search || documentType;

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      <div className="relative flex-1 w-full sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
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
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {documentTypeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
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
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {sortByOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sortOrder}
          onValueChange={(value) => onSortOrderChange(value as 'asc' | 'desc')}
        >
          <SelectTrigger className="w-30">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Newest first</SelectItem>
            <SelectItem value="asc">Oldest first</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && onClearFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
