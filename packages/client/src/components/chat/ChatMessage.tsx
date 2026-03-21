import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Copy, RefreshCw, Loader2, Check, AlignLeft, FileCode2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CitationSources } from './CitationSources';
import { ChatMarkdown } from './ChatMarkdown';
import { ToolStepsDisplay } from './ToolStepsDisplay';
import { ThinkingStepCard } from './ThinkingStepCard';
import { UserMessage } from './UserMessage';
import type { ChatMessage as ChatMessageType, Citation } from '@/stores';
import { toStopReasonLabelKey } from '@/stores/chatPanelStore.types';
import type { CopyFormat } from '@/lib/chat';
import { useTranslation } from 'react-i18next';
import { formatTime as formatTimeUtil } from '@/lib/date';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessageProps {
  message: ChatMessageType;
  canEdit?: boolean;
  canRegenerate?: boolean;
  onCitationClick: (citation: Citation) => void;
  onCopyMessage?: (content: string, format: CopyFormat) => void | Promise<void>;
  onEditMessage?: (messageId: string, content: string) => void | Promise<void>;
  onRegenerateMessage?: (messageId: string) => void;
}

const PURE_CODE_BLOCK_PATTERN = /^\s*(?:```[\s\S]*?```|~~~[\s\S]*?~~~)\s*$/;

function formatTime(date: Date): string {
  return formatTimeUtil(date);
}

// ============================================================================
// Component
// ============================================================================

function ChatMessageBase({
  message,
  canEdit = false,
  canRegenerate = false,
  onCitationClick,
  onCopyMessage,
  onEditMessage,
  onRegenerateMessage,
}: ChatMessageProps) {
  const { t } = useTranslation('chat');
  const isUser = message.role === 'user';
  const isPureCodeBlock = !isUser && PURE_CODE_BLOCK_PATTERN.test(message.content);
  const stopReasonLabelKey = toStopReasonLabelKey(message.stopReason);
  const [copiedFormat, setCopiedFormat] = useState<CopyFormat | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const revealFrameRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const previousHasAssistantContentRef = useRef(!isUser && message.content.trim().length > 0);
  const [assistantRevealState, setAssistantRevealState] = useState<'idle' | 'prepare' | 'active'>(
    'idle'
  );

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      if (revealFrameRef.current !== null) {
        window.cancelAnimationFrame(revealFrameRef.current);
      }
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const hasAssistantContent = !isUser && message.content.trim().length > 0;
    const isFirstVisibleChunk = hasAssistantContent && !previousHasAssistantContentRef.current;

    if (!isFirstVisibleChunk) {
      previousHasAssistantContentRef.current = hasAssistantContent;
      return;
    }

    previousHasAssistantContentRef.current = true;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    if (revealFrameRef.current !== null) {
      window.cancelAnimationFrame(revealFrameRef.current);
    }
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
    }

    revealFrameRef.current = window.requestAnimationFrame(() => {
      setAssistantRevealState('prepare');
      revealFrameRef.current = window.requestAnimationFrame(() => {
        setAssistantRevealState('active');
        revealTimerRef.current = window.setTimeout(() => {
          setAssistantRevealState('idle');
          revealTimerRef.current = null;
        }, 240);
      });
    });
  }, [isUser, message.content]);

  const handleCopy = useCallback(
    async (format: CopyFormat) => {
      if (!onCopyMessage) return;
      try {
        await onCopyMessage(message.content, format);
        setCopiedFormat(format);
        if (copyTimerRef.current !== null) {
          window.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = window.setTimeout(() => setCopiedFormat(null), 1500);
      } catch {
        setCopiedFormat(null);
      }
    },
    [message.content, onCopyMessage]
  );

  // User message
  if (isUser) {
    return (
      <UserMessage
        message={message}
        canEdit={canEdit}
        copiedFormat={copiedFormat}
        onCopyMessage={onCopyMessage}
        onEditMessage={onEditMessage}
        onCopy={handleCopy}
      />
    );
  }

  // Assistant message (loading with no content yet)
  if (message.isLoading && !message.content) {
    // If we have tool steps or thinking content, show them instead of generic thinking
    if ((message.toolSteps && message.toolSteps.length > 0) || message.thinkingContent) {
      const allToolsDone =
        !message.toolSteps?.length || message.toolSteps.every((s) => s.status !== 'running');
      return (
        <div className="mb-6 space-y-2">
          {message.thinkingContent && (
            <ThinkingStepCard
              content={message.thinkingContent}
              isStreaming={!allToolsDone || !message.toolSteps?.length}
            />
          )}
          {message.toolSteps && message.toolSteps.length > 0 && (
            <ToolStepsDisplay steps={message.toolSteps} />
          )}
          {allToolsDone && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="size-4 text-muted-foreground animate-spin" />
              <span className="text-sm text-muted-foreground">{t('agent.generating')}</span>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="mb-5">
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="size-4 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground">{t('message.thinking')}</span>
        </div>
      </div>
    );
  }

  // Assistant message (streaming or complete)
  return (
    <div
      className={[
        'mb-6 transition-[opacity,transform] duration-240 ease-out motion-reduce:transition-none motion-reduce:transform-none',
        assistantRevealState === 'prepare' ? 'opacity-0 translate-y-2' : '',
        assistantRevealState === 'active' ? 'opacity-100 translate-y-0' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex-1 min-w-0">
        {/* Thinking content */}
        {message.thinkingContent && (
          <div className="mb-3">
            <ThinkingStepCard content={message.thinkingContent} />
          </div>
        )}

        {/* Tool execution steps */}
        {message.toolSteps && message.toolSteps.length > 0 && (
          <ToolStepsDisplay steps={message.toolSteps} />
        )}

        <div className="text-sm">
          <ChatMarkdown
            content={message.content}
            citations={message.citations}
            onCitationClick={onCitationClick}
            isStreaming={Boolean(message.isLoading)}
          />
          {message.isLoading && (
            <Loader2 className="inline-block size-3.5 ml-1 text-muted-foreground animate-spin align-text-bottom" />
          )}
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <CitationSources citations={message.citations} onCitationClick={onCitationClick} />
        )}

        {stopReasonLabelKey && (
          <div className="mt-2 text-[11px] text-amber-700">{t(stopReasonLabelKey)}</div>
        )}

        {/* Actions */}
        {!message.isLoading && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[10px] text-muted-foreground mr-1">
              {formatTime(message.timestamp)}
            </span>
            {onCopyMessage && !isPureCodeBlock && (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={
                          copiedFormat ? t('message.copyAriaDone') : t('message.copyAria')
                        }
                      >
                        {copiedFormat ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {copiedFormat ? t('message.copied') : t('message.copy')}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" sideOffset={6} className="w-36">
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => {
                      void handleCopy('plain');
                    }}
                  >
                    <AlignLeft className="size-3.5" />
                    {t('message.copyPlain')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => {
                      void handleCopy('markdown');
                    }}
                  >
                    <FileCode2 className="size-3.5" />
                    {t('message.copyMarkdown')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canRegenerate && onRegenerateMessage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 cursor-pointer text-muted-foreground"
                    onClick={() => onRegenerateMessage(message.id)}
                    aria-label={t('message.regenerate')}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('message.regenerate')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageBase);
ChatMessage.displayName = 'ChatMessage';
