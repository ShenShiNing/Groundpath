import { useState, useMemo } from 'react';
import { Trash2, RotateCcw, Trash } from 'lucide-react';
import { toast } from 'sonner';
import type { TrashDocumentListItem } from '@knowledge-agent/shared/types';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useTrashDocuments, useRestoreDocument, usePermanentDeleteDocument } from '@/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatBytes } from '@/lib/utils';

export function TrashPage() {
  // Filters state
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'deletedAt' | 'title' | 'fileSize'>('deletedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Dialog states
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<TrashDocumentListItem | null>(null);

  // Debounce search
  const debouncedSearch = useDebouncedValue(search, 300);

  // Build query params
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

  // TanStack Query hooks
  const { data: trashData, isLoading } = useTrashDocuments(queryParams);
  const restoreMutation = useRestoreDocument();
  const permanentDeleteMutation = usePermanentDeleteDocument();

  const trashDocuments = trashData?.documents ?? [];
  const pagination = trashData?.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 0 };

  const handleRestore = (document: TrashDocumentListItem) => {
    setSelectedDocument(document);
    setRestoreDialogOpen(true);
  };

  const confirmRestore = async () => {
    if (!selectedDocument) return;
    try {
      await restoreMutation.mutateAsync(selectedDocument.id);
      toast.success('Document restored successfully');
    } catch {
      toast.error('Failed to restore document');
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
      toast.success('Document permanently deleted');
    } catch {
      toast.error('Failed to delete document');
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
      <div className="container py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trash2 className="h-6 w-6" />
              Trash
            </h1>
            <p className="text-muted-foreground">Restore or permanently delete documents</p>
          </div>
        </div>

        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Search by title..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Sort By */}
              <Select
                value={sortBy}
                onValueChange={(value: 'deletedAt' | 'title' | 'fileSize') => setSortBy(value)}
              >
                <SelectTrigger className="w-full sm:w-45">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deletedAt">Deleted Date</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="fileSize">File Size</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort Order */}
              <Select
                value={sortOrder}
                onValueChange={(value: 'asc' | 'desc') => setSortOrder(value)}
              >
                <SelectTrigger className="w-full sm:w-35">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Descending</SelectItem>
                  <SelectItem value="asc">Ascending</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear Filters */}
              <Button variant="outline" onClick={handleClearFilters}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Document List */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : trashDocuments.length === 0 ? (
              <div className="p-8 text-center">
                <Trash2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-lg font-medium mb-1">Trash is empty</p>
                <p className="text-muted-foreground">Deleted documents will appear here</p>
              </div>
            ) : (
              <div className="divide-y">
                {trashDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 hover:bg-muted/50 transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{doc.title}</h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span className="capitalize">{doc.documentType}</span>
                        <span>{formatBytes(doc.fileSize)}</span>
                        <span>Deleted {new Date(doc.deletedAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleRestore(doc)}>
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Restore
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handlePermanentDelete(doc)}
                      >
                        <Trash className="h-4 w-4 mr-1" />
                        Delete Forever
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination info */}
        {pagination.total > 0 && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Showing {trashDocuments.length} of {pagination.total} documents
          </div>
        )}
      </div>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore "{selectedDocument?.title}"? It will be moved back to
              its original location.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete "{selectedDocument?.title}"? This action
              cannot be undone and the file will be removed from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPermanentDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

export default TrashPage;
