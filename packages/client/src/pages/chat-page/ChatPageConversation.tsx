import type { RefObject } from 'react';
import { Sparkles } from 'lucide-react';
import { ChatMessage } from '@/components/chat';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { CopyFormat } from '@/lib/chat';
import type { ChatMessage as ChatStoreMessage, Citation } from '@/stores';
import { useTranslation } from 'react-i18next';

export interface ChatPageConversationProps {
  messages: ChatStoreMessage[];
  selectedKnowledgeBaseId: string | undefined;
  highlightedMessageId: string | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  onCitationClick: (citation: Citation) => void;
  onCopyMessage: (content: string, format: CopyFormat) => void;
  onRetry: (messageId: string) => void;
  onEditMessage: (messageId: string, content: string) => void;
}

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
}: ChatPageConversationProps) {
  const { t } = useTranslation('chat');

  return (
    <div className="min-h-0 flex-1">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 py-8 md:px-6">
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <Sparkles className="size-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">{t('empty.title')}</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {selectedKnowledgeBaseId ? t('empty.withKb') : t('empty.general')}
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="h-full">
          <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
            {messages.map((message, index) => {
              const nextMessage = messages[index + 1];
              const canEdit =
                message.role === 'user' &&
                (!isLoading ||
                  (index === messages.length - 2 &&
                    nextMessage?.role === 'assistant' &&
                    nextMessage.isLoading));

              return (
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
                    canEdit={canEdit}
                    canRegenerate={message.role === 'assistant' && !message.isLoading}
                    onCitationClick={onCitationClick}
                    onCopyMessage={onCopyMessage}
                    onEditMessage={onEditMessage}
                    onRegenerateMessage={onRetry}
                  />
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
