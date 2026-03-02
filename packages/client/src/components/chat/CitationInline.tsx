import { cn } from '@/lib/utils';
import type { Citation } from '@/stores';

// ============================================================================
// Types
// ============================================================================

export interface CitationInlineProps {
  index: number;
  citation: Citation;
  onClick: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function CitationInline({ index, onClick }: CitationInlineProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center',
        'size-5 rounded text-[10px] font-semibold',
        'bg-primary/10 text-primary hover:bg-primary/20',
        'transition-colors cursor-pointer',
        'align-super ml-0.5'
      )}
      onClick={onClick}
    >
      {index}
    </button>
  );
}
