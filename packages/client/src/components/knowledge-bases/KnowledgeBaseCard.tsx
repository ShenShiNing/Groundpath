import { Link } from '@tanstack/react-router';
import { MoreVertical, FileText, Layers } from 'lucide-react';
import type { KnowledgeBaseListItem } from '@knowledge-agent/shared/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDeleteKnowledgeBase } from '@/hooks';
import { toast } from 'sonner';

interface KnowledgeBaseCardProps {
  knowledgeBase: KnowledgeBaseListItem;
  onEdit?: (kb: KnowledgeBaseListItem) => void;
}

// Icon configurations for different knowledge base types/providers
const iconColorVariants = [
  { bg: 'bg-blue-500/10', text: 'text-blue-500' },
  { bg: 'bg-purple-500/10', text: 'text-purple-500' },
  { bg: 'bg-orange-500/10', text: 'text-orange-500' },
  { bg: 'bg-teal-500/10', text: 'text-teal-500' },
  { bg: 'bg-red-500/10', text: 'text-red-500' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
];

function getIconColors(id: string) {
  // Generate consistent color based on ID
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return iconColorVariants[hash % iconColorVariants.length]!;
}

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

export function KnowledgeBaseCard({ knowledgeBase, onEdit }: KnowledgeBaseCardProps) {
  const iconColors = getIconColors(knowledgeBase.id);
  const deleteMutation = useDeleteKnowledgeBase();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(knowledgeBase.id);
      toast.success('Knowledge base deleted');
    } catch {
      toast.error('Failed to delete knowledge base');
    }
  };

  return (
    <div className="group relative flex flex-col rounded-xl border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
      {/* Header with Icon and Menu */}
      <div className="flex justify-between items-start mb-4">
        <div className={cn('size-12 rounded-lg flex items-center justify-center', iconColors.bg)}>
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
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/knowledge-bases/${knowledgeBase.id}` as string}>Open</Link>
            </DropdownMenuItem>
            {onEdit && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  onEdit(knowledgeBase);
                }}
              >
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      <Link to={`/knowledge-bases/${knowledgeBase.id}` as string} className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col gap-1 mb-4">
          <h3 className="text-lg font-bold leading-tight line-clamp-1">{knowledgeBase.name}</h3>
          {knowledgeBase.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {knowledgeBase.description}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-muted-foreground">Ready</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="size-3" />
              {knowledgeBase.documentCount}
            </span>
            <span>{formatTimeAgo(knowledgeBase.updatedAt)}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}
