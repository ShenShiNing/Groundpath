import { useState, useMemo } from 'react';
import { FolderPlus, Upload, Trash2 } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { DocumentListItem, DocumentType, FolderTreeNode } from '@knowledge-agent/shared/types';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
import {
  DocumentUpload,
  DocumentList,
  DocumentFilters,
  FolderTree,
  FolderDialog,
} from '@/components/documents';
import { useDocuments, useDeleteDocument, useFolderTree, useDeleteFolder } from '@/hooks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export function DocumentsPage() {
  // Filters state
  const [search, setSearch] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType | undefined>();
  const [sortBy, setSortBy] = useState<'createdAt' | 'updatedAt' | 'title' | 'fileSize'>(
    'createdAt'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Dialog states
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<FolderTreeNode | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentListItem | null>(null);
  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<FolderTreeNode | null>(null);

  // Debounce search
  const debouncedSearch = useDebouncedValue(search, 300);

  // Build query params
  const queryParams = useMemo(
    () => ({
      page: 1,
      pageSize: 20,
      search: debouncedSearch || undefined,
      documentType,
      sortBy,
      sortOrder,
      folderId: selectedFolderId,
    }),
    [debouncedSearch, documentType, sortBy, sortOrder, selectedFolderId]
  );

  // TanStack Query hooks
  const { data: documentsData, isLoading } = useDocuments(queryParams);
  const { data: folderTree = [] } = useFolderTree();
  const deleteDocumentMutation = useDeleteDocument();
  const deleteFolderMutation = useDeleteFolder();

  const documents = documentsData?.documents ?? [];
  const pagination = documentsData?.pagination ?? {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  };

  const handleClearFilters = () => {
    setSearch('');
    setDocumentType(undefined);
    setSortBy('createdAt');
    setSortOrder('desc');
  };

  const handleDelete = (document: DocumentListItem) => {
    setDocumentToDelete(document);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!documentToDelete) return;
    try {
      await deleteDocumentMutation.mutateAsync(documentToDelete.id);
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    }
    setDeleteDialogOpen(false);
    setDocumentToDelete(null);
  };

  const handleUploadSuccess = () => {
    setUploadSheetOpen(false);
    // Documents will be refetched automatically via query invalidation
  };

  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
  };

  const handleEditFolder = (folder: FolderTreeNode) => {
    setFolderToEdit(folder);
    setFolderDialogOpen(true);
  };

  const handleDeleteFolder = (folder: FolderTreeNode) => {
    setFolderToDelete(folder);
    setDeleteFolderDialogOpen(true);
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      await deleteFolderMutation.mutateAsync({
        id: folderToDelete.id,
        moveContentsToRoot: true,
      });
      toast.success('Folder deleted');
      if (selectedFolderId === folderToDelete.id) {
        setSelectedFolderId(null);
      }
    } catch {
      toast.error('Failed to delete folder');
    }
    setDeleteFolderDialogOpen(false);
    setFolderToDelete(null);
  };

  const handleNewFolder = () => {
    setFolderToEdit(null);
    setFolderDialogOpen(true);
  };

  return (
    <AppLayout showFooter="simple">
      <div className="container py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Documents</h1>
            <p className="text-muted-foreground">Manage your documents and files</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/trash">
                <Trash2 className="h-4 w-4 mr-2" />
                Trash
              </Link>
            </Button>

            <Button variant="outline" onClick={handleNewFolder}>
              <FolderPlus className="h-4 w-4 mr-2" />
              New Folder
            </Button>

            <Sheet open={uploadSheetOpen} onOpenChange={setUploadSheetOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>Upload Documents</SheetTitle>
                  <SheetDescription>
                    Upload PDF, Markdown, Text, or Word documents.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  <DocumentUpload folderId={selectedFolderId} onSuccess={handleUploadSuccess} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar - Folder Tree */}
          <div className="hidden md:block w-64 shrink-0">
            <Card>
              <CardContent className="p-4">
                <h2 className="font-semibold mb-3">Folders</h2>
                <FolderTree
                  folders={folderTree}
                  selectedFolderId={selectedFolderId}
                  onSelectFolder={handleFolderSelect}
                  onEditFolder={handleEditFolder}
                  onDeleteFolder={handleDeleteFolder}
                />
              </CardContent>
            </Card>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <Card className="mb-4">
              <CardContent className="p-4">
                <DocumentFilters
                  search={search}
                  onSearchChange={setSearch}
                  documentType={documentType}
                  onDocumentTypeChange={setDocumentType}
                  sortBy={sortBy}
                  onSortByChange={setSortBy}
                  sortOrder={sortOrder}
                  onSortOrderChange={setSortOrder}
                  onClearFilters={handleClearFilters}
                />
              </CardContent>
            </Card>

            <DocumentList documents={documents} isLoading={isLoading} onDelete={handleDelete} />

            {/* Pagination info */}
            {pagination.total > 0 && (
              <div className="mt-4 text-center text-sm text-muted-foreground">
                Showing {documents.length} of {pagination.total} documents
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Folder Dialog */}
      <FolderDialog
        key={folderToEdit?.id ?? 'new'}
        open={folderDialogOpen}
        onOpenChange={(open) => {
          setFolderDialogOpen(open);
          if (!open) setFolderToEdit(null);
        }}
        folder={folderToEdit ?? undefined}
        parentId={folderToEdit ? undefined : selectedFolderId}
      />

      {/* Delete Document Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Trash</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to move "{documentToDelete?.title}" to trash? You can restore it
              later from the trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Move to Trash</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Folder Confirmation Dialog */}
      <AlertDialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{folderToDelete?.name}"? The folder will be deleted
              and its contents will be moved to the root level.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFolder}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

export default DocumentsPage;
