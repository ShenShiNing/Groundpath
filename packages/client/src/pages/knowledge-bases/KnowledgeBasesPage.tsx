import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Database,
  FileText,
  ChevronRight,
  MoreHorizontal,
  Layers,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useKnowledgeBases, useDeleteKnowledgeBase } from '@/hooks';
import { KnowledgeBaseDialog } from '@/components/knowledge-bases';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { KnowledgeBaseListItem } from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'grid' | 'table';

// ============================================================================
// Helpers
// ============================================================================

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const dateObj = new Date(date);
  const seconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  return dateObj.toLocaleDateString();
}

// Icon color variants based on ID
const iconColorVariants = [
  { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400' },
  { bg: 'bg-purple-50 dark:bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400' },
  { bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400' },
  { bg: 'bg-teal-50 dark:bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400' },
  { bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400' },
  { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' },
];

function getIconColors(id: string) {
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return iconColorVariants[hash % iconColorVariants.length]!;
}

// ============================================================================
// KnowledgeBase Card Component (Grid View)
// ============================================================================

function KnowledgeBaseGridCard({
  knowledgeBase,
  onEdit,
  onDelete,
}: {
  knowledgeBase: KnowledgeBaseListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const iconColors = getIconColors(knowledgeBase.id);

  return (
    <Link
      to={`/knowledge-bases/${knowledgeBase.id}`}
      className={cn(
        'group flex flex-col p-4 rounded-lg border bg-card',
        'hover:bg-accent/50 transition-colors cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('size-10 rounded-lg flex items-center justify-center', iconColors.bg)}>
          <Layers className={cn('size-5', iconColors.text)} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.preventDefault()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                onEdit();
              }}
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h3 className="font-medium text-sm mb-1 truncate">{knowledgeBase.name}</h3>
      {knowledgeBase.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {knowledgeBase.description}
        </p>
      )}

      <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileText className="size-3" />
          {knowledgeBase.documentCount}
        </span>
        <span>{formatTimeAgo(knowledgeBase.updatedAt)}</span>
      </div>
    </Link>
  );
}

// ============================================================================
// KnowledgeBase Table Row Component (Table View)
// ============================================================================

function KnowledgeBaseTableRow({
  knowledgeBase,
  onEdit,
  onDelete,
}: {
  knowledgeBase: KnowledgeBaseListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const iconColors = getIconColors(knowledgeBase.id);

  return (
    <TableRow className="group">
      <TableCell className="py-3">
        <Link
          to={`/knowledge-bases/${knowledgeBase.id}`}
          className="flex items-center gap-3 hover:underline"
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
        {formatTimeAgo(knowledgeBase.updatedAt)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// Empty State Component
// ============================================================================

function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="size-12 rounded-xl bg-muted flex items-center justify-center mb-4">
        <Database className="size-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium mb-1">No knowledge bases yet</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        Create your first knowledge base to start uploading documents and using RAG.
      </p>
      <Button onClick={onCreateNew}>
        <Plus className="size-4 mr-2" />
        Create Knowledge Base
      </Button>
    </div>
  );
}

// ============================================================================
// No Results State Component
// ============================================================================

function NoResultsState({ search, onClear }: { search: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="size-12 rounded-xl bg-muted flex items-center justify-center mb-4">
        <Search className="size-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium mb-1">No results found</h3>
      <p className="text-sm text-muted-foreground mb-4">No knowledge bases match "{search}".</p>
      <Button variant="outline" onClick={onClear}>
        Clear search
      </Button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function KnowledgeBasesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKB, setEditingKB] = useState<KnowledgeBaseListItem | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');

  const { data: knowledgeBases, isLoading } = useKnowledgeBases();
  const deleteMutation = useDeleteKnowledgeBase();

  // Filter knowledge bases
  const filteredKBs = knowledgeBases?.filter((kb) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      kb.name.toLowerCase().includes(searchLower) ||
      kb.description?.toLowerCase().includes(searchLower)
    );
  });

  const handleEdit = (kb: KnowledgeBaseListItem) => {
    setEditingKB(kb);
    setDialogOpen(true);
  };

  const handleDelete = async (kb: KnowledgeBaseListItem) => {
    try {
      await deleteMutation.mutateAsync(kb.id);
      toast.success('Knowledge base deleted');
    } catch {
      toast.error('Failed to delete knowledge base');
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingKB(undefined);
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        {/* Page Header */}
        <div className="border-b bg-background">
          <div className="px-6 py-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
              <span>Home</span>
              <ChevronRight className="size-4" />
              <span className="text-foreground">Knowledge Bases</span>
            </div>

            {/* Title & Actions */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Knowledge Bases</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage and organize your AI knowledge repositories.
                </p>
              </div>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-2" />
                New
              </Button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between px-6 py-2 border-t bg-muted/30">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pl-9 h-8 text-sm bg-background"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-md p-0.5 bg-background">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-7 w-7 rounded-sm', viewMode === 'grid' && 'bg-muted')}
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-7 w-7 rounded-sm', viewMode === 'table' && 'bg-muted')}
                  onClick={() => setViewMode('table')}
                >
                  <List className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-36 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            )
          ) : filteredKBs && filteredKBs.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* Create New Card */}
                <button
                  onClick={() => setDialogOpen(true)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 p-4 rounded-lg',
                    'border-2 border-dashed',
                    'hover:border-primary hover:bg-accent/50 transition-colors cursor-pointer',
                    'min-h-36'
                  )}
                >
                  <div className="size-10 rounded-lg bg-muted flex items-center justify-center">
                    <Plus className="size-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium">New Knowledge Base</span>
                </button>

                {filteredKBs.map((kb) => (
                  <KnowledgeBaseGridCard
                    key={kb.id}
                    knowledgeBase={kb}
                    onEdit={() => handleEdit(kb)}
                    onDelete={() => handleDelete(kb)}
                  />
                ))}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="font-medium">Name</TableHead>
                      <TableHead className="font-medium w-28">Documents</TableHead>
                      <TableHead className="font-medium w-28">Chunks</TableHead>
                      <TableHead className="font-medium w-32">Updated</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredKBs.map((kb) => (
                      <KnowledgeBaseTableRow
                        key={kb.id}
                        knowledgeBase={kb}
                        onEdit={() => handleEdit(kb)}
                        onDelete={() => handleDelete(kb)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : knowledgeBases && knowledgeBases.length > 0 && search ? (
            <NoResultsState search={search} onClear={() => setSearch('')} />
          ) : (
            <EmptyState onCreateNew={() => setDialogOpen(true)} />
          )}
        </div>
      </div>

      <KnowledgeBaseDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        knowledgeBase={editingKB}
      />
    </AppLayout>
  );
}
