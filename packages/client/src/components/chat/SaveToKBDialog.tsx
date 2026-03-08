import { useState, useMemo, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  buildConversationMarkdownForKnowledgeSeed,
  sanitizeMessageContentForKnowledgeSeed,
} from '@/lib/chat';
import { knowledgeBasesApi, conversationApi } from '@/api';
import { useCreateKnowledgeBase, useKnowledgeBases } from '@/hooks';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/stores/chatPanelStore';

type KnowledgeSeedSource = 'conversation' | 'latest-assistant';
type KbSeedMode = 'new' | 'existing';

function sanitizeFileName(input: string): string {
  const invalidChars = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
  const sanitized = input
    .trim()
    .split('')
    .map((char) => {
      const codePoint = char.charCodeAt(0);
      if (codePoint <= 31 || invalidChars.has(char)) {
        return '_';
      }
      return char;
    })
    .join('');

  return input ? sanitized.replace(/\s+/g, '-').slice(0, 80) : '';
}

export interface SaveToKBDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  conversationId: string | null;
  selectedKnowledgeBaseId: string | undefined;
  knowledgeBaseName?: string;
  onKbSwitch: (kbId: string) => void;
}

export function SaveToKBDialog({
  open,
  onOpenChange,
  messages,
  conversationId,
  selectedKnowledgeBaseId,
  knowledgeBaseName,
  onKbSwitch,
}: SaveToKBDialogProps) {
  const { t } = useTranslation('chat');
  const { data: knowledgeBases = [] } = useKnowledgeBases();
  const createKnowledgeBase = useCreateKnowledgeBase();

  const hasExistingKbs = knowledgeBases.length > 0;

  const [kbSeedMode, setKbSeedMode] = useState<KbSeedMode>(hasExistingKbs ? 'existing' : 'new');
  const [targetKbId, setTargetKbId] = useState<string | null>(
    hasExistingKbs ? (selectedKnowledgeBaseId ?? knowledgeBases[0]?.id ?? null) : null
  );
  const [newKbName, setNewKbName] = useState(knowledgeBaseName ?? t('kb.defaultName'));
  const [newKbDescription, setNewKbDescription] = useState('');
  const [newKbEmbeddingProvider, setNewKbEmbeddingProvider] =
    useState<EmbeddingProviderType>('zhipu');
  const [seedSource, setSeedSource] = useState<KnowledgeSeedSource>('latest-assistant');
  const [switchToNewKb, setSwitchToNewKb] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const assistantMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.role === 'assistant' && !message.isLoading && message.content.trim().length > 0
      ),
    [messages]
  );
  const latestAssistantMessage = useMemo(
    () => assistantMessages[assistantMessages.length - 1] ?? null,
    [assistantMessages]
  );

  const handleSave = useCallback(async () => {
    if (kbSeedMode === 'new' && !newKbName.trim()) {
      toast.error(t('kbName.required'));
      return;
    }

    if (kbSeedMode === 'existing' && !targetKbId) {
      toast.error(t('createKb.kbRequired'));
      return;
    }

    if (seedSource === 'latest-assistant' && !latestAssistantMessage) {
      toast.error(t('latestAssistant.none'));
      return;
    }

    const conversationContent = buildConversationMarkdownForKnowledgeSeed(
      messages
        .filter((message) => !message.isLoading)
        .map((message) => ({
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          citations: message.citations,
          toolSteps: message.toolSteps?.map((step) => ({
            toolCalls: step.toolCalls.map((call) => ({ name: call.name })),
            toolResults: step.toolResults?.map((result) => ({ content: result.content })),
          })),
        })),
      {
        transcript: t('export.transcriptTitle'),
        user: t('export.user'),
        assistant: t('export.assistant'),
      }
    );
    const latestAssistantContent = latestAssistantMessage
      ? sanitizeMessageContentForKnowledgeSeed({
          role: latestAssistantMessage.role,
          content: latestAssistantMessage.content,
          timestamp: latestAssistantMessage.timestamp,
          citations: latestAssistantMessage.citations,
          toolSteps: latestAssistantMessage.toolSteps?.map((step) => ({
            toolCalls: step.toolCalls.map((call) => ({ name: call.name })),
            toolResults: step.toolResults?.map((result) => ({ content: result.content })),
          })),
        })
      : '';
    const selectedContent =
      seedSource === 'latest-assistant' ? latestAssistantContent : conversationContent;

    if (!selectedContent.trim()) {
      toast.error(t('content.empty'));
      return;
    }

    setIsCreating(true);
    try {
      let finalKbId: string;

      if (kbSeedMode === 'existing') {
        finalKbId = targetKbId!;
      } else {
        const knowledgeBase = await createKnowledgeBase.mutateAsync({
          name: newKbName.trim(),
          description: newKbDescription.trim() || null,
          embeddingProvider: newKbEmbeddingProvider,
        });
        finalKbId = knowledgeBase.id;
      }

      const documentTitle =
        seedSource === 'latest-assistant'
          ? t('seed.documentTitle.latestAssistant')
          : t('seed.documentTitle.transcript');
      const fileBaseName =
        sanitizeFileName(documentTitle || (kbSeedMode === 'new' ? newKbName.trim() : '')) ||
        'chat-notes';
      const file = new File([selectedContent], `${fileBaseName}.md`, {
        type: 'text/markdown',
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', documentTitle);
      formData.append('description', t('seed.documentDescription'));

      await knowledgeBasesApi.uploadDocument(finalKbId, formData);

      if (switchToNewKb) {
        if (conversationId) {
          await conversationApi.update(conversationId, { knowledgeBaseId: finalKbId });
        }
        onKbSwitch(finalKbId);
      }

      onOpenChange(false);
      toast.success(
        kbSeedMode === 'existing' ? t('createKb.appendSuccess') : t('kbCreate.success')
      );
    } catch {
      toast.error(t('kbCreate.error'));
    } finally {
      setIsCreating(false);
    }
  }, [
    conversationId,
    createKnowledgeBase,
    kbSeedMode,
    latestAssistantMessage,
    messages,
    newKbDescription,
    newKbEmbeddingProvider,
    newKbName,
    onKbSwitch,
    onOpenChange,
    seedSource,
    switchToNewKb,
    t,
    targetKbId,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('createKb.title')}</DialogTitle>
          <DialogDescription>{t('createKb.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="kb-seed-mode"
                value="new"
                checked={kbSeedMode === 'new'}
                onChange={() => setKbSeedMode('new')}
                className="accent-primary"
              />
              <span className="text-sm">{t('createKb.modeNew')}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="kb-seed-mode"
                value="existing"
                checked={kbSeedMode === 'existing'}
                onChange={() => setKbSeedMode('existing')}
                disabled={knowledgeBases.length === 0}
                className="accent-primary"
              />
              <span
                className={cn('text-sm', knowledgeBases.length === 0 && 'text-muted-foreground')}
              >
                {t('createKb.modeExisting')}
              </span>
            </label>
          </div>

          {kbSeedMode === 'existing' ? (
            <div className="grid gap-2">
              <Label htmlFor="chat-target-kb">{t('createKb.selectKb')}</Label>
              <Select value={targetKbId ?? ''} onValueChange={(value) => setTargetKbId(value)}>
                <SelectTrigger id="chat-target-kb">
                  <SelectValue placeholder={t('createKb.selectKb')} />
                </SelectTrigger>
                <SelectContent>
                  {knowledgeBases.map((kb) => (
                    <SelectItem key={kb.id} value={kb.id}>
                      {kb.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="chat-kb-name">{t('createKb.name')}</Label>
                <Input
                  id="chat-kb-name"
                  value={newKbName}
                  onChange={(event) => setNewKbName(event.target.value)}
                  placeholder={t('createKb.namePlaceholder')}
                  maxLength={200}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="chat-kb-description">{t('createKb.descriptionLabel')}</Label>
                <Textarea
                  id="chat-kb-description"
                  value={newKbDescription}
                  onChange={(event) => setNewKbDescription(event.target.value)}
                  placeholder={t('createKb.descriptionPlaceholder')}
                  maxLength={2000}
                  rows={3}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="chat-kb-provider">{t('createKb.provider')}</Label>
                <Select
                  value={newKbEmbeddingProvider}
                  onValueChange={(value) =>
                    setNewKbEmbeddingProvider(value as EmbeddingProviderType)
                  }
                >
                  <SelectTrigger id="chat-kb-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zhipu">Zhipu AI</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="ollama">Ollama (Local)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="grid gap-2">
            <Label htmlFor="chat-seed-source">{t('createKb.seedSource')}</Label>
            <Select
              value={seedSource}
              onValueChange={(value) => setSeedSource(value as KnowledgeSeedSource)}
            >
              <SelectTrigger id="chat-seed-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conversation">{t('createKb.seedSourceConversation')}</SelectItem>
                <SelectItem value="latest-assistant" disabled={!latestAssistantMessage}>
                  {t('createKb.seedSourceLatestAssistant')}
                </SelectItem>
              </SelectContent>
            </Select>
            {seedSource === 'latest-assistant' && !latestAssistantMessage && (
              <p className="text-xs text-amber-600">
                {t('createKb.seedSourceLatestAssistantEmpty')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="switch-to-new-kb"
              checked={switchToNewKb}
              onCheckedChange={(checked) => setSwitchToNewKb(checked === true)}
            />
            <Label htmlFor="switch-to-new-kb" className="text-sm">
              {t('createKb.switchToKb')}
            </Label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('createKb.cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                {t('createKb.creating')}
              </>
            ) : kbSeedMode === 'existing' ? (
              t('createKb.submitAppend')
            ) : (
              t('createKb.submit')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
