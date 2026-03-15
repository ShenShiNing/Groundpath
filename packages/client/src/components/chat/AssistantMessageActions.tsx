import { useCallback, useEffect, useRef, useState } from 'react';
import { AlignLeft, Check, Copy, FileCode2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CopyFormat } from '@/lib/chat';
import { formatTime as formatTimeUtil } from '@/lib/date';

interface AssistantMessageActionsProps {
  messageId: string;
  messageContent: string;
  timestamp: Date;
  isPureCodeBlock: boolean;
  canRegenerate: boolean;
  onCopyMessage?: (content: string, format: CopyFormat) => void | Promise<void>;
  onRegenerateMessage?: (messageId: string) => void;
}

function formatTime(date: Date): string {
  return formatTimeUtil(date);
}

export function AssistantMessageActions({
  messageId,
  messageContent,
  timestamp,
  isPureCodeBlock,
  canRegenerate,
  onCopyMessage,
  onRegenerateMessage,
}: AssistantMessageActionsProps) {
  const { t } = useTranslation('chat');
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
      if (!onCopyMessage) return;
      try {
        await onCopyMessage(messageContent, format);
        setCopiedFormat(format);
        if (copyTimerRef.current !== null) {
          window.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = window.setTimeout(() => setCopiedFormat(null), 1500);
      } catch {
        setCopiedFormat(null);
      }
    },
    [messageContent, onCopyMessage]
  );

  return (
    <div className="flex items-center gap-1 mt-2">
      <span className="text-[10px] text-muted-foreground mr-1">{formatTime(timestamp)}</span>
      {onCopyMessage && !isPureCodeBlock && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={copiedFormat ? t('message.copyAriaDone') : t('message.copyAria')}
                >
                  {copiedFormat ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
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
              onClick={() => onRegenerateMessage(messageId)}
              aria-label={t('message.regenerate')}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('message.regenerate')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
