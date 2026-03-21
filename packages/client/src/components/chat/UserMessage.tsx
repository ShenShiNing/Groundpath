import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Check, SquarePen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatMessage } from '@/stores';
import type { CopyFormat } from '@/lib/chat';
import { useTranslation } from 'react-i18next';
import { formatTime as formatTimeUtil } from '@/lib/date';

interface UserMessageProps {
  message: ChatMessage;
  canEdit: boolean;
  copiedFormat: CopyFormat | null;
  onCopyMessage?: (content: string, format: CopyFormat) => void | Promise<void>;
  onEditMessage?: (messageId: string, content: string) => void | Promise<void>;
  onCopy: (format: CopyFormat) => Promise<void>;
}

function formatTime(date: Date): string {
  return formatTimeUtil(date);
}

export function UserMessage({
  message,
  canEdit,
  copiedFormat,
  onCopyMessage,
  onEditMessage,
  onCopy,
}: UserMessageProps) {
  const { t } = useTranslation('chat');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(message.content);
    }
  }, [isEditing, message.content]);

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
                        void onCopy('plain');
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
