import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from 'react-i18next';
import type { DocumentListItem } from '@groundpath/shared/types';
import { DocumentGridCard, DocumentTableRow } from '../DocumentItemViews';
import { useVirtualGrid } from '@/hooks/useVirtualGrid';
import { useVirtualList } from '@/hooks/useVirtualList';
import type { ViewMode } from './types';

const GRID_COLUMNS = {
  breakpoints: [
    [1536, 5], // 2xl
    [1280, 4], // xl
    [1024, 3], // lg
    [640, 2], // sm
  ] as [number, number][],
  default: 1,
};
const GRID_ROW_HEIGHT = 144; // h-36
const TABLE_ROW_HEIGHT = 56; // h-14

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

function VirtualDocumentGrid({
  documents,
  onDocumentClick,
  onDeleteDocument,
  onDownloadDocument,
}: {
  documents: DocumentListItem[];
  onDocumentClick: (d: DocumentListItem) => void;
  onDeleteDocument: (d: DocumentListItem) => void;
  onDownloadDocument: (d: DocumentListItem) => void;
}) {
  const { parentRef, virtualizer, getRowItems, columnCount, gap } = useVirtualGrid({
    items: documents,
    columns: GRID_COLUMNS,
    estimateRowHeight: GRID_ROW_HEIGHT,
    gap: 16,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto px-6 py-5">
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
              {rowItems.map((document) => (
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
          );
        })}
      </div>
    </div>
  );
}

function VirtualDocumentTable({
  documents,
  onDocumentClick,
  onDeleteDocument,
  onDownloadDocument,
}: {
  documents: DocumentListItem[];
  onDocumentClick: (d: DocumentListItem) => void;
  onDeleteDocument: (d: DocumentListItem) => void;
  onDownloadDocument: (d: DocumentListItem) => void;
}) {
  const { t } = useTranslation('knowledgeBase');
  const { parentRef, virtualizer } = useVirtualList({
    count: documents.length,
    estimateSize: TABLE_ROW_HEIGHT,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1]!.end
      : 0;

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto px-6 py-5">
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
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop, padding: 0, border: 'none' }} />
              </tr>
            )}
            {virtualItems.map((virtualRow) => {
              const document = documents[virtualRow.index];
              return (
                <DocumentTableRow
                  key={document.id}
                  document={document}
                  onSelect={() => onDocumentClick(document)}
                  onEdit={() => onDocumentClick(document)}
                  onDelete={() => onDeleteDocument(document)}
                  onDownload={() => onDownloadDocument(document)}
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

  // For small lists, skip virtualization
  const useVirtual = filteredDocuments.length > 30;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {search && (
        <div className="flex flex-wrap items-center gap-2 px-6 pt-5">
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
        <div className="px-6 py-5">
          {viewMode === 'grid' ? (
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
          )}
        </div>
      ) : filteredDocuments.length > 0 ? (
        useVirtual ? (
          viewMode === 'grid' ? (
            <VirtualDocumentGrid
              documents={filteredDocuments}
              onDocumentClick={onDocumentClick}
              onDeleteDocument={onDeleteDocument}
              onDownloadDocument={onDownloadDocument}
            />
          ) : (
            <VirtualDocumentTable
              documents={filteredDocuments}
              onDocumentClick={onDocumentClick}
              onDeleteDocument={onDeleteDocument}
              onDownloadDocument={onDownloadDocument}
            />
          )
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {viewMode === 'grid' ? (
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
            )}
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
  );
}
