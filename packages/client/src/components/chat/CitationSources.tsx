import { useState } from 'react';
import { ChevronDown, FileText, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Citation } from '@/stores/chatPanelStore';

// ============================================================================
// Types
// ============================================================================

export interface CitationSourcesProps {
  citations: Citation[];
  onCitationClick: (citation: Citation) => void;
}

// ============================================================================
// Component
// ============================================================================

export function CitationSources({ citations, onCitationClick }: CitationSourcesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (citations.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronDown className={cn('size-3.5 transition-transform', isExpanded && 'rotate-180')} />
        <span>
          {citations.length} source{citations.length > 1 ? 's' : ''}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {citations.map((citation, index) => (
            <div
              key={citation.id}
              className={cn(
                'flex items-start gap-2 p-2 rounded-lg',
                'bg-muted/50 border border-transparent',
                'hover:border-primary/30 transition-colors cursor-pointer'
              )}
              onClick={() => onCitationClick(citation)}
            >
              {/* Index Badge */}
              <span className="size-5 rounded bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">
                {index + 1}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <FileText className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium truncate">{citation.documentTitle}</span>
                  {citation.pageNumber && (
                    <span className="text-[10px] text-muted-foreground">
                      p.{citation.pageNumber}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{citation.content}</p>
              </div>

              {/* Open Button */}
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onCitationClick(citation);
                }}
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
