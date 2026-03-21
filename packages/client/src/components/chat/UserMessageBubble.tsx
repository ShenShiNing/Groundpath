import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Check, Loader2, SquarePen, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatMessage } from '@/stores';
import type { CopyFormat } from '@/lib/chat';
import { formatTime as formatTimeUtil } from '@/lib/date';

interface UserMessageBubbleProps {
  message: ChatMessage;
  canEdit: boolean;
  onCopyMessage?: (content: string, format: CopyFormat) => void | Promise<void>;
  onEditMessage?: (messageId: string, content: string) => void | Promise<void>;
}

function formatTime(date: Date): string {
  return formatTimeUtil(date);
}

export function UserMessageBubble({
  message,
  canEdit,
  onCopyMessage,
  onEditMessage,
}: UserMessageBubbleProps) {
  const { t } = useTranslation('chat');
  const [copiedFormat, setCopiedFormat] = useState<CopyFormat | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isEditing) {
      setDraft(message.content);
    }
  }, [isEditing, message.content]);

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

  const handleSubmitEdit = useCallback(async () => {
    if (!onEditMessage) return;

    const trimmedDraft = draft.trim();
    if (!trimmedDraft || trimmedDraft === message.content.trim()) {
      setIsEditing(false);
      setDraft(message.content);
      return;
    }

    setIsSavingEdit(true);
    try {
      await onEditMessage(message.id, trimmedDraft);
      setIsEditing(false);
    } finally {
      setIsSavingEdit(false);
    }
  }, [draft, message.content, message.id, onEditMessage]);

  return (
    <div className="mb-5 flex justify-end">
      <div className={isEditing ? 'w-full' : 'max-w-[85%]'}>
        {isEditing ? (
          <div className="rounded-2xl rounded-tr-md border bg-background p-3 shadow-sm">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmitEdit();
                }
              }}
              className="min-h-24 w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm text-foreground outline-none"
              disabled={isSavingEdit}
              autoFocus
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="cursor-pointer text-xs"
                onClick={() => {
                  setIsEditing(false);
                  setDraft(message.content);
                }}
                disabled={isSavingEdit}
              >
                <X className="size-3.5" />
                {t('message.cancelEdit')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="cursor-pointer text-xs"
                onClick={() => {
                  void handleSubmitEdit();
                }}
                disabled={isSavingEdit || draft.trim().length === 0}
              >
                {isSavingEdit ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <SquarePen className="size-3.5" />
                )}
                {t('message.saveEdit')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-2xl rounded-tr-md bg-muted px-4 py-2.5 text-sm text-foreground">
              {message.content}
            </div>
            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
              <span>{formatTime(message.timestamp)}</span>
              {onCopyMessage && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 cursor-pointer text-muted-foreground"
                      onClick={() => {
                        void handleCopy('plain');
                      }}
                      aria-label={copiedFormat ? t('message.copyAriaDone') : t('message.copyAria')}
                    >
                      {copiedFormat ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {copiedFormat ? t('message.copied') : t('message.copy')}
                  </TooltipContent>
                </Tooltip>
              )}
              {canEdit && onEditMessage && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 cursor-pointer text-muted-foreground"
                      onClick={() => setIsEditing(true)}
                      aria-label={t('message.edit')}
                    >
                      <SquarePen className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('message.edit')}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
