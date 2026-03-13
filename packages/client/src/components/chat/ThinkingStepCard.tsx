import { useState } from 'react';
import { Brain, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export interface ThinkingStepCardProps {
  content: string;
  isStreaming?: boolean;
}

export function ThinkingStepCard({ content, isStreaming }: ThinkingStepCardProps) {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {isStreaming ? (
          <Loader2 className="size-3.5 text-muted-foreground animate-spin shrink-0" />
        ) : expanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}

        <span className="flex items-center gap-1 text-muted-foreground">
          <Brain className="size-3 shrink-0" />
          <span>{t('agent.thinking')}</span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-3 py-2">
          <div
            className={cn(
              'text-muted-foreground whitespace-pre-wrap wrap-break-word max-h-60 overflow-y-auto'
            )}
          >
            {content}
            {isStreaming && (
              <Loader2 className="inline-block size-3 ml-1 animate-spin align-text-bottom" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
