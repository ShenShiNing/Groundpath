import type { ReactNode } from 'react';
import { Bot, Copy, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CitationSources } from './CitationSources';
import { CitationInline } from './CitationInline';
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

interface ParsedSegment {
  type: 'text' | 'citation';
  content: string;
  citationIndex?: number;
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

function parseContent(content: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      });
    }

    // Add the citation
    segments.push({
      type: 'citation',
      content: match[0],
      citationIndex: parseInt(match[1], 10),
    });

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex),
    });
  }

  return segments;
}

function renderContent(
  content: string,
  citations: Citation[] | undefined,
  onCitationClick: (citation: Citation) => void
): ReactNode {
  const segments = parseContent(content);

  return segments.map((segment, index) => {
    if (segment.type === 'text') {
      return <span key={index}>{segment.content}</span>;
    }

    const citation = citations?.[segment.citationIndex! - 1];
    if (!citation) {
      return <span key={index}>{segment.content}</span>;
    }

    return (
      <CitationInline
        key={index}
        index={segment.citationIndex!}
        citation={citation}
        onClick={() => onCitationClick(citation)}
      />
    );
  });
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

  // Assistant message (loading with no content yet)
  if (message.isLoading && !message.content) {
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

  // Assistant message (streaming or complete)
  return (
    <div className="flex gap-3 mb-4">
      <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0">
        <Bot className="size-4 text-primary-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0">
          {renderContent(message.content, message.citations, onCitationClick)}
          {message.isLoading && (
            <Loader2 className="inline-block size-3.5 ml-1 text-muted-foreground animate-spin align-text-bottom" />
          )}
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <CitationSources citations={message.citations} onCitationClick={onCitationClick} />
        )}

        {/* Actions */}
        {!message.isLoading && (
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
        )}
      </div>
    </div>
  );
}
