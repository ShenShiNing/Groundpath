import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  KbSeedMode,
  KnowledgeSeedSource,
  SaveToKBDialogFormProps,
} from './SaveToKBDialog.types';

function ModeSelector({
  knowledgeBaseCount,
  kbSeedMode,
  onKbSeedModeChange,
}: {
  knowledgeBaseCount: number;
  kbSeedMode: KbSeedMode;
  onKbSeedModeChange: (mode: KbSeedMode) => void;
}) {
  const { t } = useTranslation('chat');

  return (
    <div className="flex gap-4">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="radio"
          name="kb-seed-mode"
          value="new"
          checked={kbSeedMode === 'new'}
          onChange={() => onKbSeedModeChange('new')}
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
          onChange={() => onKbSeedModeChange('existing')}
          disabled={knowledgeBaseCount === 0}
          className="accent-primary"
        />
        <span className={cn('text-sm', knowledgeBaseCount === 0 && 'text-muted-foreground')}>
          {t('createKb.modeExisting')}
        </span>
      </label>
    </div>
  );
}

function ExistingKnowledgeBaseField({
  targetKbId,
  knowledgeBases,
  onTargetKbIdChange,
}: {
  targetKbId: string | null;
  knowledgeBases: SaveToKBDialogFormProps['knowledgeBases'];
  onTargetKbIdChange: (targetKbId: string) => void;
}) {
  const { t } = useTranslation('chat');

  return (
    <div className="grid gap-2">
      <Label htmlFor="chat-target-kb">{t('createKb.selectKb')}</Label>
      <Select value={targetKbId ?? ''} onValueChange={onTargetKbIdChange}>
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
  );
}

function NewKnowledgeBaseFields({
  newKbName,
  onNewKbNameChange,
  newKbDescription,
  onNewKbDescriptionChange,
  newKbEmbeddingProvider,
  onNewKbEmbeddingProviderChange,
}: {
  newKbName: string;
  onNewKbNameChange: (value: string) => void;
  newKbDescription: string;
  onNewKbDescriptionChange: (value: string) => void;
  newKbEmbeddingProvider: EmbeddingProviderType;
  onNewKbEmbeddingProviderChange: (provider: EmbeddingProviderType) => void;
}) {
  const { t } = useTranslation('chat');

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="chat-kb-name">{t('createKb.name')}</Label>
        <Input
          id="chat-kb-name"
          value={newKbName}
          onChange={(event) => onNewKbNameChange(event.target.value)}
          placeholder={t('createKb.namePlaceholder')}
          maxLength={200}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="chat-kb-description">{t('createKb.descriptionLabel')}</Label>
        <Textarea
          id="chat-kb-description"
          value={newKbDescription}
          onChange={(event) => onNewKbDescriptionChange(event.target.value)}
          placeholder={t('createKb.descriptionPlaceholder')}
          maxLength={2000}
          rows={3}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="chat-kb-provider">{t('createKb.provider')}</Label>
        <Select
          value={newKbEmbeddingProvider}
          onValueChange={(value) => onNewKbEmbeddingProviderChange(value as EmbeddingProviderType)}
        >
          <SelectTrigger id="chat-kb-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zhipu">{t('createKb.providerZhipu')}</SelectItem>
            <SelectItem value="openai">{t('createKb.providerOpenAI')}</SelectItem>
            <SelectItem value="ollama">{t('createKb.providerOllama')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function SeedSourceField({
  seedSource,
  onSeedSourceChange,
  hasLatestAssistantMessage,
}: {
  seedSource: KnowledgeSeedSource;
  onSeedSourceChange: (source: KnowledgeSeedSource) => void;
  hasLatestAssistantMessage: boolean;
}) {
  const { t } = useTranslation('chat');

  return (
    <div className="grid gap-2">
      <Label htmlFor="chat-seed-source">{t('createKb.seedSource')}</Label>
      <Select
        value={seedSource}
        onValueChange={(value) => onSeedSourceChange(value as KnowledgeSeedSource)}
      >
        <SelectTrigger id="chat-seed-source">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="conversation">{t('createKb.seedSourceConversation')}</SelectItem>
          <SelectItem value="latest-assistant" disabled={!hasLatestAssistantMessage}>
            {t('createKb.seedSourceLatestAssistant')}
          </SelectItem>
        </SelectContent>
      </Select>
      {seedSource === 'latest-assistant' && !hasLatestAssistantMessage && (
        <p className="text-xs text-amber-600">{t('createKb.seedSourceLatestAssistantEmpty')}</p>
      )}
    </div>
  );
}

export function SaveToKBDialogForm({
  open,
  onOpenChange,
  knowledgeBases,
  kbSeedMode,
  onKbSeedModeChange,
  targetKbId,
  onTargetKbIdChange,
  newKbName,
  onNewKbNameChange,
  newKbDescription,
  onNewKbDescriptionChange,
  newKbEmbeddingProvider,
  onNewKbEmbeddingProviderChange,
  seedSource,
  onSeedSourceChange,
  hasLatestAssistantMessage,
  switchToNewKb,
  onSwitchToNewKbChange,
  isCreating,
  onSave,
}: SaveToKBDialogFormProps) {
  const { t } = useTranslation('chat');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('createKb.title')}</DialogTitle>
          <DialogDescription>{t('createKb.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <ModeSelector
            knowledgeBaseCount={knowledgeBases.length}
            kbSeedMode={kbSeedMode}
            onKbSeedModeChange={onKbSeedModeChange}
          />

          {kbSeedMode === 'existing' ? (
            <ExistingKnowledgeBaseField
              targetKbId={targetKbId}
              knowledgeBases={knowledgeBases}
              onTargetKbIdChange={onTargetKbIdChange}
            />
          ) : (
            <NewKnowledgeBaseFields
              newKbName={newKbName}
              onNewKbNameChange={onNewKbNameChange}
              newKbDescription={newKbDescription}
              onNewKbDescriptionChange={onNewKbDescriptionChange}
              newKbEmbeddingProvider={newKbEmbeddingProvider}
              onNewKbEmbeddingProviderChange={onNewKbEmbeddingProviderChange}
            />
          )}

          <SeedSourceField
            seedSource={seedSource}
            onSeedSourceChange={onSeedSourceChange}
            hasLatestAssistantMessage={hasLatestAssistantMessage}
          />

          <div className="flex items-center gap-2">
            <Checkbox
              id="switch-to-new-kb"
              checked={switchToNewKb}
              onCheckedChange={(checked) => onSwitchToNewKbChange(checked === true)}
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
          <Button onClick={onSave} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
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
