import { useState } from 'react';
import { Loader2, Search, Globe, ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolStep } from '@/stores';
import { useTranslation } from 'react-i18next';

export interface ToolStepCardProps {
  step: ToolStep;
}

const TOOL_ICONS: Record<string, typeof Search> = {
  knowledge_base_search: Search,
  web_search: Globe,
};

export function ToolStepCard({ step }: ToolStepCardProps) {
  const { t } = useTranslation('chat');
  const isRunning = step.status === 'running';
  const [expanded, setExpanded] = useState(isRunning);

  const hasError = step.toolResults?.some((r) => r.isError);

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {isRunning ? (
          <Loader2 className="size-3.5 text-muted-foreground animate-spin shrink-0" />
        ) : hasError ? (
          <XCircle className="size-3.5 text-destructive shrink-0" />
        ) : expanded ? (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
        )}

        <div className="flex flex-1 items-center gap-1.5 min-w-0">
          {step.toolCalls.map((tc) => {
            const Icon = TOOL_ICONS[tc.name] ?? Search;
            return (
              <span key={tc.id} className="flex items-center gap-1 text-muted-foreground">
                <Icon className="size-3 shrink-0" />
                <span className="truncate">
                  {tc.name === 'knowledge_base_search'
                    ? t('agent.kbSearch')
                    : tc.name === 'web_search'
                      ? t('agent.webSearch')
                      : tc.name}
                </span>
              </span>
            );
          })}
        </div>

        {isRunning && (
          <span className="text-muted-foreground shrink-0">{t('agent.searching')}</span>
        )}
        {!isRunning && step.durationMs != null && (
          <span className="text-muted-foreground shrink-0">
            {t('agent.duration', { ms: step.durationMs })}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 space-y-2">
          {step.toolCalls.map((tc) => (
            <div key={tc.id} className="space-y-1">
              <div className="text-muted-foreground">
                {t('agent.query')}:{' '}
                <span className="text-foreground">
                  {typeof tc.arguments.query === 'string'
                    ? tc.arguments.query
                    : JSON.stringify(tc.arguments)}
                </span>
              </div>

              {step.toolResults && (
                <>
                  {step.toolResults
                    .filter((r) => r.toolCallId === tc.id)
                    .map((r) => (
                      <div
                        key={r.toolCallId}
                        className={cn(
                          'text-muted-foreground line-clamp-3',
                          r.isError && 'text-destructive'
                        )}
                      >
                        {r.isError
                          ? `${t('agent.error')}: ${r.content}`
                          : r.content.substring(0, 200) + (r.content.length > 200 ? '...' : '')}
                      </div>
                    ))}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
