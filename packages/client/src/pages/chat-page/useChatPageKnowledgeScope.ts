import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/stores';
import type { KnowledgeBaseListItem } from '@knowledge-agent/shared/types';
import { readStoredChatScope, resolveChatScopeValue, writeStoredChatScope } from './chatScope';

interface UseChatPageKnowledgeScopeArgs {
  knowledgeBases: KnowledgeBaseListItem[];
  knowledgeBaseId: string | null;
  conversationId: string | null;
  messages: ChatMessage[];
  open: (kbId?: string | null) => void;
  startNewConversation: () => void;
  switchKnowledgeBase: (newKbId: string | null) => void;
}

export function useChatPageKnowledgeScope({
  knowledgeBases,
  knowledgeBaseId,
  conversationId,
  messages,
  open,
  startNewConversation,
  switchKnowledgeBase,
}: UseChatPageKnowledgeScopeArgs) {
  const { t } = useTranslation('chat');
  const [preferredKnowledgeBaseId, setPreferredKnowledgeBaseId] = useState<
    string | null | undefined
  >(() => readStoredChatScope());
  const [scopeSwitchDialogOpen, setScopeSwitchDialogOpen] = useState(false);
  const [pendingKnowledgeBaseId, setPendingKnowledgeBaseId] = useState<string | null | undefined>(
    undefined
  );

  const selectedKnowledgeBaseId = useMemo(
    () =>
      conversationId
        ? knowledgeBaseId
        : resolveChatScopeValue(knowledgeBases, {
            currentKnowledgeBaseId: knowledgeBaseId,
            storedScope: preferredKnowledgeBaseId,
          }),
    [conversationId, knowledgeBaseId, knowledgeBases, preferredKnowledgeBaseId]
  );

  useEffect(() => {
    const targetKnowledgeBaseId = selectedKnowledgeBaseId ?? null;
    if (conversationId && targetKnowledgeBaseId !== knowledgeBaseId) {
      return;
    }
    if (targetKnowledgeBaseId !== knowledgeBaseId) {
      open(targetKnowledgeBaseId);
    }
  }, [conversationId, knowledgeBaseId, open, selectedKnowledgeBaseId]);

  const pendingKnowledgeBaseName = useMemo(() => {
    if (pendingKnowledgeBaseId === undefined || pendingKnowledgeBaseId === null) {
      return t('mode.general');
    }

    return (
      knowledgeBases.find((knowledgeBase) => knowledgeBase.id === pendingKnowledgeBaseId)?.name ??
      t('mode.general')
    );
  }, [knowledgeBases, pendingKnowledgeBaseId, t]);

  const applyKnowledgeBaseSelection = useCallback(
    (knowledgeBaseIdToUse: string | null, options?: { startFreshConversation?: boolean }) => {
      if (options?.startFreshConversation) {
        startNewConversation();
      }

      setPreferredKnowledgeBaseId(knowledgeBaseIdToUse);
      switchKnowledgeBase(knowledgeBaseIdToUse);
      writeStoredChatScope(knowledgeBaseIdToUse);
    },
    [startNewConversation, switchKnowledgeBase]
  );

  const handleKnowledgeBaseChange = useCallback(
    (knowledgeBaseIdToUse: string | null) => {
      if (knowledgeBaseIdToUse === (selectedKnowledgeBaseId ?? null)) {
        return;
      }

      if (messages.length > 0) {
        setPendingKnowledgeBaseId(knowledgeBaseIdToUse);
        setScopeSwitchDialogOpen(true);
        return;
      }

      applyKnowledgeBaseSelection(knowledgeBaseIdToUse);
    },
    [applyKnowledgeBaseSelection, messages.length, selectedKnowledgeBaseId]
  );

  const handleScopeSwitchDialogOpenChange = useCallback((open: boolean) => {
    setScopeSwitchDialogOpen(open);

    if (!open) {
      setPendingKnowledgeBaseId(undefined);
    }
  }, []);

  const handleConfirmScopeSwitch = useCallback(() => {
    if (pendingKnowledgeBaseId === undefined) {
      return;
    }

    applyKnowledgeBaseSelection(pendingKnowledgeBaseId, { startFreshConversation: true });
    setPendingKnowledgeBaseId(undefined);
    setScopeSwitchDialogOpen(false);
  }, [applyKnowledgeBaseSelection, pendingKnowledgeBaseId]);

  const handleKbSwitch = useCallback(
    (knowledgeBaseIdToUse: string) => {
      applyKnowledgeBaseSelection(knowledgeBaseIdToUse);
    },
    [applyKnowledgeBaseSelection]
  );

  return {
    selectedKnowledgeBaseId,
    scopeSwitchDialogOpen,
    pendingKnowledgeBaseName,
    handleKnowledgeBaseChange,
    handleScopeSwitchDialogOpenChange,
    handleConfirmScopeSwitch,
    handleKbSwitch,
  };
}
