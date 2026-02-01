import { Bot, Copy, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CitationSources } from './CitationSources';
import type { ChatMessage as ChatMessageType, Citation } from '@/stores/chatPanelStore';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessageProps {
  message: ChatMessageType;
  onCitationClick: (citation: Citation) => void;
  onCopy?: () => void;
  onRegenerate?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderContent(content: string): string {
  // Replace citation markers [1], [2] etc. with styled spans
  return content.replace(
    /\[(\d+)\]/g,
    '<span class="inline-flex items-center justify-center size-5 rounded bg-primary/10 text-primary text-[10px] font-semibold align-super ml-0.5 cursor-pointer">$1</span>'
  );
}

// ============================================================================
// Component
// ============================================================================

export function ChatMessage({ message, onCitationClick, onCopy, onRegenerate }: ChatMessageProps) {
  const isUser = message.role === 'user';

  // User message
  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[85%]">
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
            {message.content}
          </div>
          <div className="text-[10px] text-muted-foreground text-right mt-1">
            {formatTime(message.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message (loading)
  if (message.isLoading) {
    return (
      <div className="flex gap-3 mb-4">
        <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0">
          <Bot className="size-4 text-primary-foreground" />
        </div>
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="size-4 text-muted-foreground animate-spin" />
          <span className="text-sm text-muted-foreground">Thinking...</span>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex gap-3 mb-4">
      <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0">
        <Bot className="size-4 text-primary-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0"
          dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}
        />

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <CitationSources citations={message.citations} onCitationClick={onCitationClick} />
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 mt-2">
          {onCopy && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-muted-foreground"
              onClick={onCopy}
            >
              <Copy className="size-3 mr-1" />
              Copy
            </Button>
          )}
          {onRegenerate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-muted-foreground"
              onClick={onRegenerate}
            >
              <RefreshCw className="size-3 mr-1" />
              Regenerate
            </Button>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}
