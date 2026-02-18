import { Trash2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ConversationListItem } from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

export interface ConversationItemProps {
  conversation: ConversationListItem;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

// ============================================================================
// Component
// ============================================================================

export function ConversationItem({
  conversation,
  isActive,
  onClick,
  onDelete,
}: ConversationItemProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-2 cursor-pointer',
        'hover:bg-muted/50 rounded-lg transition-colors',
        isActive && 'bg-muted'
      )}
      onClick={onClick}
    >
      <MessageSquare className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{conversation.title || 'New conversation'}</p>
        <p className="text-[10px] text-muted-foreground">
          {formatDate(conversation.lastMessageAt || conversation.createdAt)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleDelete}
      >
        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  );
}
