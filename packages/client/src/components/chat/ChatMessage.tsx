import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CitationSources } from './CitationSources';
import { ChatMarkdown } from './ChatMarkdown';
import { ToolStepsDisplay } from './ToolStepsDisplay';
import { ThinkingStepCard } from './ThinkingStepCard';
import { UserMessage } from './UserMessage';
import { AssistantMessageActions } from './AssistantMessageActions';
import type { ChatMessage as ChatMessageType, Citation } from '@/stores';
import { toStopReasonLabelKey } from '@/stores/chatPanelStore.types';
import type { CopyFormat } from '@/lib/chat';
import { useTranslation } from 'react-i18next';

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

// ============================================================================
// Memo helpers
// ============================================================================

function hasSameArrayItems<T>(previous: readonly T[] | undefined, next: readonly T[] | undefined) {
  if (previous === next) {
    return true;
  }

  if (!previous || !next || previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }

  return true;
}

function areMessagesRenderEqual(previous: ChatMessageType, next: ChatMessageType) {
  return (
    previous.id === next.id &&
    previous.role === next.role &&
    previous.content === next.content &&
    previous.thinkingContent === next.thinkingContent &&
    previous.isLoading === next.isLoading &&
    previous.stopReason === next.stopReason &&
    previous.timestamp.getTime() === next.timestamp.getTime() &&
    hasSameArrayItems(previous.citations, next.citations) &&
    hasSameArrayItems(previous.toolSteps, next.toolSteps)
  );
}

function areChatMessagePropsEqual(previous: ChatMessageProps, next: ChatMessageProps) {
  return (
    previous.canEdit === next.canEdit &&
    previous.canRegenerate === next.canRegenerate &&
    previous.onCitationClick === next.onCitationClick &&
    previous.onCopyMessage === next.onCopyMessage &&
    previous.onEditMessage === next.onEditMessage &&
    previous.onRegenerateMessage === next.onRegenerateMessage &&
    areMessagesRenderEqual(previous.message, next.message)
  );
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
          <AssistantMessageActions
            messageId={message.id}
            messageContent={message.content}
            timestamp={message.timestamp}
            isPureCodeBlock={isPureCodeBlock}
            canRegenerate={canRegenerate}
            onCopyMessage={onCopyMessage}
            onRegenerateMessage={onRegenerateMessage}
          />
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageBase, areChatMessagePropsEqual);
ChatMessage.displayName = 'ChatMessage';
