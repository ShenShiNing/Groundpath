import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Copy,
  RefreshCw,
  Loader2,
  Check,
  ChevronDown,
  AlignLeft,
  FileCode2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CitationSources } from './CitationSources';
import { ChatMarkdown } from './ChatMarkdown';
import type { ChatMessage as ChatMessageType, Citation } from '@/stores/chatPanelStore';
import type { CopyFormat } from '@/lib/chat';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessageProps {
  message: ChatMessageType;
  onCitationClick: (citation: Citation) => void;
  onCopy?: (format: CopyFormat) => void | Promise<void>;
  onRegenerate?: () => void;
}

const PURE_CODE_BLOCK_PATTERN = /^\s*(?:```[\s\S]*?```|~~~[\s\S]*?~~~)\s*$/;

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// Component
// ============================================================================

export function ChatMessage({ message, onCitationClick, onCopy, onRegenerate }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isPureCodeBlock = !isUser && PURE_CODE_BLOCK_PATTERN.test(message.content);
  const [copiedFormat, setCopiedFormat] = useState<CopyFormat | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(
    async (format: CopyFormat) => {
      if (!onCopy) return;
      try {
        await onCopy(format);
        setCopiedFormat(format);
        if (copyTimerRef.current !== null) {
          window.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = window.setTimeout(() => setCopiedFormat(null), 1500);
      } catch {
        setCopiedFormat(null);
      }
    },
    [onCopy]
  );

  // User message
  if (isUser) {
    return (
      <div className="mb-5 flex justify-end">
        <div className="max-w-[85%]">
          <div className="rounded-2xl rounded-tr-md bg-muted px-4 py-2.5 text-sm text-foreground">
            {message.content}
          </div>
          <div className="mt-1 text-right text-[10px] text-muted-foreground">
            {formatTime(message.timestamp)}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message (loading with no content yet)
  if (message.isLoading && !message.content) {
    return (
      <div className="mb-5 flex gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Bot className="size-4" />
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
    <div className="mb-6 flex gap-3">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bot className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm">
          <ChatMarkdown
            content={message.content}
            citations={message.citations}
            onCitationClick={onCitationClick}
          />
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
            {onCopy && !isPureCodeBlock && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 cursor-pointer gap-1.5 px-2 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={copiedFormat ? '已复制消息' : '复制消息'}
                  >
                    {copiedFormat ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    <span>{copiedFormat ? '已复制' : '复制'}</span>
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={6} className="w-36">
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => {
                      void handleCopy('plain');
                    }}
                  >
                    <AlignLeft className="size-3.5" />
                    复制纯文本
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => {
                      void handleCopy('markdown');
                    }}
                  >
                    <FileCode2 className="size-3.5" />
                    复制 Markdown
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {onRegenerate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] text-muted-foreground cursor-pointer"
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
