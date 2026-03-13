import { useCallback, useMemo, useState } from 'react';
import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';
import { knowledgeBasesApi, conversationApi } from '@/api';
import { useCreateKnowledgeBase, useKnowledgeBases } from '@/hooks';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  buildKnowledgeSeedContent,
  getKnowledgeSeedDocumentTitle,
  sanitizeFileName,
} from './SaveToKBDialog.helpers';
import { SaveToKBDialogForm } from './SaveToKBDialogForm';
import type { KbSeedMode, KnowledgeSeedSource, SaveToKBDialogProps } from './SaveToKBDialog.types';

export type { SaveToKBDialogProps } from './SaveToKBDialog.types';

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

    const selectedContent = buildKnowledgeSeedContent(
      messages,
      latestAssistantMessage,
      seedSource,
      t
    );

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

      const documentTitle = getKnowledgeSeedDocumentTitle(seedSource, t);
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
    <SaveToKBDialogForm
      open={open}
      onOpenChange={onOpenChange}
      knowledgeBases={knowledgeBases}
      kbSeedMode={kbSeedMode}
      onKbSeedModeChange={setKbSeedMode}
      targetKbId={targetKbId}
      onTargetKbIdChange={setTargetKbId}
      newKbName={newKbName}
      onNewKbNameChange={setNewKbName}
      newKbDescription={newKbDescription}
      onNewKbDescriptionChange={setNewKbDescription}
      newKbEmbeddingProvider={newKbEmbeddingProvider}
      onNewKbEmbeddingProviderChange={setNewKbEmbeddingProvider}
      seedSource={seedSource}
      onSeedSourceChange={setSeedSource}
      hasLatestAssistantMessage={latestAssistantMessage !== null}
      switchToNewKb={switchToNewKb}
      onSwitchToNewKbChange={setSwitchToNewKb}
      isCreating={isCreating}
      onSave={() => void handleSave()}
    />
  );
}
