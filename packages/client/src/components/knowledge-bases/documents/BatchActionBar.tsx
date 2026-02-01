import { X, Trash2, FolderInput, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// Types
// ============================================================================

export interface BatchActionBarProps {
  selectedCount: number;
  onDelete: () => void;
  onMove: () => void;
  onReprocess?: () => void;
  onClearSelection: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function BatchActionBar({
  selectedCount,
  onDelete,
  onMove,
  onReprocess,
  onClearSelection,
}: BatchActionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-y border-primary/20 animate-in slide-in-from-top-2">
      {/* Selection Count */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClearSelection}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Separator */}
      <div className="h-5 w-px bg-border" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onMove}>
          <FolderInput className="size-4 mr-1.5" />
          Move to...
        </Button>

        {onReprocess && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onReprocess}>
            <RotateCcw className="size-4 mr-1.5" />
            Reprocess
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
        >
          <Trash2 className="size-4 mr-1.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}
