import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
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

function getToolQueryDisplay(argumentsValue: Record<string, unknown>): string {
  return typeof argumentsValue.query === 'string'
    ? argumentsValue.query
    : JSON.stringify(argumentsValue);
}

function ToolResultContent({
  content,
  isError,
  t,
}: {
  content: string;
  isError?: boolean;
  t: TFunction<'chat'>;
}) {
  const [resultExpanded, setResultExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el && !resultExpanded) {
      setIsClamped(el.scrollHeight > el.clientHeight);
    }
  }, [content, resultExpanded]);

  const displayText = isError ? `${t('agent.error')}: ${content}` : content;

  return (
    <div>
      <div
        ref={contentRef}
        className={cn(
          'text-muted-foreground whitespace-pre-wrap wrap-break-word',
          isError && 'text-destructive',
          !resultExpanded && 'line-clamp-4'
        )}
      >
        {displayText}
      </div>
      {(isClamped || resultExpanded) && (
        <button
          type="button"
          className="mt-1 text-primary/80 hover:text-primary text-[11px] transition-colors"
          onClick={() => setResultExpanded((prev) => !prev)}
        >
          {resultExpanded ? t('agent.showLess') : t('agent.showMore')}
        </button>
      )}
    </div>
  );
}

export function ToolStepCard({ step }: ToolStepCardProps) {
  const { t } = useTranslation('chat');
  const isRunning = step.status === 'running';
  const [expanded, setExpanded] = useState(isRunning);
  const uniqueToolCalls = Array.from(
    new Map(step.toolCalls.map((toolCall) => [toolCall.name, toolCall])).values()
  );

  const hasError = step.toolResults?.some((result) => result.isError);

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
          {uniqueToolCalls.map((toolCall) => {
            const Icon = TOOL_ICONS[toolCall.name] ?? Search;
            return (
              <span key={toolCall.id} className="flex items-center gap-1 text-muted-foreground">
                <Icon className="size-3 shrink-0" />
                <span className="truncate">
                  {toolCall.name === 'knowledge_base_search'
                    ? t('agent.kbSearch')
                    : toolCall.name === 'web_search'
                      ? t('agent.webSearch')
                      : toolCall.name}
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
          {step.toolCalls.map((toolCall) => (
            <div key={toolCall.id} className="space-y-1">
              <div className="text-muted-foreground">
                {t('agent.query')}:{' '}
                <span className="text-foreground">{getToolQueryDisplay(toolCall.arguments)}</span>
              </div>

              {step.toolResults && (
                <>
                  {step.toolResults
                    .filter((result) => result.toolCallId === toolCall.id)
                    .map((result) => (
                      <ToolResultContent
                        key={result.toolCallId}
                        content={result.content}
                        isError={result.isError}
                        t={t}
                      />
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
