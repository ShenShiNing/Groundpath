import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { ChatMessage } from '@/components/chat';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { CopyFormat } from '@/lib/chat';
import type { ChatMessage as ChatStoreMessage, Citation } from '@/stores';
import { useElementVirtualizer } from '@/hooks/useElementVirtualizer';
import { useTranslation } from 'react-i18next';

const VIRTUAL_THRESHOLD = 50;
const ESTIMATED_MESSAGE_HEIGHT = 120;

export interface ChatPageConversationProps {
  messages: ChatStoreMessage[];
  selectedKnowledgeBaseId: string | null;
  highlightedMessageId: string | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  onCitationClick: (citation: Citation) => void;
  onCopyMessage: (content: string, format: CopyFormat) => void;
  onRetry: (messageId: string) => void;
  onEditMessage: (messageId: string, content: string) => void | Promise<void>;
  /** Mutable ref set by VirtualMessageList so the scroll-focus hook can ask the virtualizer to render a specific message */
  ensureMessageVisibleRef?: MutableRefObject<((messageId: string) => void) | null>;
}

function canEditMessage(
  message: ChatStoreMessage,
  index: number,
  messages: ChatStoreMessage[],
  isLoading: boolean
): boolean {
  if (message.role !== 'user') return false;
  if (!isLoading) return true;
  const nextMessage = messages[index + 1];
  return (
    index === messages.length - 2 &&
    nextMessage?.role === 'assistant' &&
    Boolean(nextMessage.isLoading)
  );
}

/* ------------------------------------------------------------------ */
/*  Virtual message list                                              */
/* ------------------------------------------------------------------ */

function VirtualMessageList({
  messages,
  highlightedMessageId,
  messagesEndRef,
  isLoading,
  onCitationClick,
  onCopyMessage,
  onRetry,
  onEditMessage,
  ensureMessageVisibleRef,
}: Omit<ChatPageConversationProps, 'selectedKnowledgeBaseId'>) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useElementVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT,
    overscan: 5,
  });

  // Expose scrollToIndex so the scroll-focus hook can make off-screen messages visible
  useEffect(() => {
    if (!ensureMessageVisibleRef) return;
    ensureMessageVisibleRef.current = (messageId: string) => {
      const index = messages.findIndex((m) => m.id === messageId);
      if (index >= 0) {
        virtualizer.scrollToIndex(index, { align: 'center' });
      }
    };
    return () => {
      if (ensureMessageVisibleRef) ensureMessageVisibleRef.current = null;
    };
  }, [ensureMessageVisibleRef, messages, virtualizer]);

  return (
    <div
      ref={scrollContainerRef}
      data-slot="scroll-area-viewport"
      className="h-full overflow-y-auto"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const message = messages[virtualItem.index]!;
            return (
              <div
                key={message.id}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <div
                  id={`chat-message-${message.id}`}
                  className={cn(
                    'scroll-mt-24 rounded-lg transition-colors duration-700',
                    highlightedMessageId === message.id
                      ? 'bg-transparent ring-2 ring-primary/45 ring-offset-2 ring-offset-background'
                      : 'bg-transparent'
                  )}
                >
                  <ChatMessage
                    message={message}
                    canEdit={canEditMessage(message, virtualItem.index, messages, isLoading)}
                    canRegenerate={message.role === 'assistant' && !message.isLoading}
                    onCitationClick={onCitationClick}
                    onCopyMessage={onCopyMessage}
                    onEditMessage={onEditMessage}
                    onRegenerateMessage={onRetry}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export function ChatPageConversation({
  messages,
  selectedKnowledgeBaseId,
  highlightedMessageId,
  messagesEndRef,
  isLoading,
  onCitationClick,
  onCopyMessage,
  onRetry,
  onEditMessage,
  ensureMessageVisibleRef,
}: ChatPageConversationProps) {
  const { t } = useTranslation('chat');

  return (
    <div className="min-h-0 flex-1">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 py-8 md:px-6">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <h3 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {t('empty.title')}
            </h3>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              {selectedKnowledgeBaseId ? t('empty.withKb') : t('empty.general')}
            </p>
          </div>
        </div>
      ) : messages.length > VIRTUAL_THRESHOLD ? (
        <VirtualMessageList
          messages={messages}
          highlightedMessageId={highlightedMessageId}
          messagesEndRef={messagesEndRef}
          isLoading={isLoading}
          onCitationClick={onCitationClick}
          onCopyMessage={onCopyMessage}
          onRetry={onRetry}
          onEditMessage={onEditMessage}
          ensureMessageVisibleRef={ensureMessageVisibleRef}
        />
      ) : (
        <ScrollArea className="h-full">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
            {messages.map((message, index) => (
              <div
                key={message.id}
                id={`chat-message-${message.id}`}
                className={cn(
                  'scroll-mt-24 rounded-lg transition-colors duration-700',
                  highlightedMessageId === message.id
                    ? 'bg-transparent ring-2 ring-primary/45 ring-offset-2 ring-offset-background'
                    : 'bg-transparent'
                )}
              >
                <ChatMessage
                  message={message}
                  canEdit={canEditMessage(message, index, messages, isLoading)}
                  canRegenerate={message.role === 'assistant' && !message.isLoading}
                  onCitationClick={onCitationClick}
                  onCopyMessage={onCopyMessage}
                  onEditMessage={onEditMessage}
                  onRegenerateMessage={onRetry}
                />
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
