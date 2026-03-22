import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from 'react-i18next';
import type { DocumentListItem } from '@groundpath/shared/types';
import { DocumentGridCard, DocumentTableRow } from '../DocumentItemViews';
import type { ViewMode } from './types';

interface KnowledgeBaseDocumentsContentProps {
  docsLoading: boolean;
  filteredDocuments: DocumentListItem[];
  search: string;
  viewMode: ViewMode;
  onDocumentClick: (document: DocumentListItem) => void;
  onDeleteDocument: (document: DocumentListItem) => void;
  onDownloadDocument: (document: DocumentListItem) => void;
  onClearSearch: () => void;
  onOpenUpload: () => void;
}

export function KnowledgeBaseDocumentsContent({
  docsLoading,
  filteredDocuments,
  search,
  viewMode,
  onDocumentClick,
  onDeleteDocument,
  onDownloadDocument,
  onClearSearch,
  onOpenUpload,
}: KnowledgeBaseDocumentsContentProps) {
  const { t } = useTranslation('knowledgeBase');

  return (
    <div className="flex-1 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="px-6 py-5">
          {search && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('detail.search.current')}</span>
              <Badge variant="secondary" className="gap-1">
                "{search}"
                <button type="button" className="cursor-pointer" onClick={onClearSearch}>
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
                {[...Array(12)].map((_, index) => (
                  <Skeleton key={index} className="h-36 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {[...Array(8)].map((_, index) => (
                  <Skeleton key={index} className="h-14 rounded-lg" />
                ))}
              </div>
            )
          ) : filteredDocuments.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredDocuments.map((document) => (
                  <DocumentGridCard
                    key={document.id}
                    document={document}
                    onSelect={() => onDocumentClick(document)}
                    onEdit={() => onDocumentClick(document)}
                    onDelete={() => onDeleteDocument(document)}
                    onDownload={() => onDownloadDocument(document)}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="font-medium">{t('detail.table.name')}</TableHead>
                      <TableHead className="w-24 font-medium">{t('detail.table.type')}</TableHead>
                      <TableHead className="w-24 font-medium">{t('detail.table.size')}</TableHead>
                      <TableHead className="w-32 font-medium">{t('detail.table.status')}</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.map((document) => (
                      <DocumentTableRow
                        key={document.id}
                        document={document}
                        onSelect={() => onDocumentClick(document)}
                        onEdit={() => onDocumentClick(document)}
                        onDelete={() => onDeleteDocument(document)}
                        onDownload={() => onDownloadDocument(document)}
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
                <Button variant="outline" className="cursor-pointer" onClick={onClearSearch}>
                  {t('detail.action.clearSearch')}
                </Button>
              ) : (
                <Button className="cursor-pointer" onClick={onOpenUpload}>
                  <Upload className="mr-2 size-4" />
                  {t('detail.action.upload')}
                </Button>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
