import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { ConversationListItem } from '@groundpath/shared/types';

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
// Component
// ============================================================================

export function ConversationItem({
  conversation,
  isActive,
  onClick,
  onDelete,
}: ConversationItemProps) {
  const { t } = useTranslation(['chat', 'common']);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors',
        isActive
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-current={isActive ? 'true' : undefined}
    >
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm">{conversation.title || t('conversation.untitled')}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={handleDelete}
        aria-label={t('delete', { ns: 'common' })}
      >
        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  );
}
