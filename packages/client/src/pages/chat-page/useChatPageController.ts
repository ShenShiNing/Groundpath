import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useKBDocuments, useKnowledgeBases } from '@/hooks';
import { useStreamBuffer } from '@/hooks/useStreamBuffer';
import { copyMessageToClipboard, type CopyFormat } from '@/lib/chat';
import { getAccessTokenSnapshot, useChatPanelStore, type Citation } from '@/stores';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  findFirstMatchingTextElement,
  getPreferredKnowledgeBaseId,
  getProcessingDocumentCount,
  getSearchableDocuments,
} from './utils';

const AUTO_SCROLL_THRESHOLD_PX = 48;

export function useChatPageController() {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const skipNextAutoScrollRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const primedTurnAssistantIdRef = useRef<string | null>(null);
  const knowledgeBaseId = useChatPanelStore((state) => state.knowledgeBaseId);
  const conversationId = useChatPanelStore((state) => state.conversationId);
  const messages = useChatPanelStore((state) => state.messages);
  const focusMessageId = useChatPanelStore((state) => state.focusMessageId);
  const focusKeyword = useChatPanelStore((state) => state.focusKeyword);
  const selectedDocumentIds = useChatPanelStore((state) => state.selectedDocumentIds);
  const isLoading = useChatPanelStore((state) => state.isLoading);
  const open = useChatPanelStore((state) => state.open);
  const sendMessage = useChatPanelStore((state) => state.sendMessage);
  const editMessage = useChatPanelStore((state) => state.editMessage);
  const retryMessage = useChatPanelStore((state) => state.retryMessage);
  const stopGeneration = useChatPanelStore((state) => state.stopGeneration);
  const appendToLastMessage = useChatPanelStore((state) => state.appendToLastMessage);
  const setDocumentScope = useChatPanelStore((state) => state.setDocumentScope);
  const clearMessages = useChatPanelStore((state) => state.clearMessages);
  const startNewConversation = useChatPanelStore((state) => state.startNewConversation);
  const switchKnowledgeBase = useChatPanelStore((state) => state.switchKnowledgeBase);
  const clearFocusMessageId = useChatPanelStore((state) => state.clearFocusMessageId);

  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string | undefined>(
    knowledgeBaseId ?? undefined
  );
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewCitation, setPreviewCitation] = useState<Citation | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [createKbDialogOpen, setCreateKbDialogOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const { data: knowledgeBases = [], isLoading: kbLoading, isError: kbError } = useKnowledgeBases();
  const {
    data: documentsResponse,
    isLoading: docsLoading,
    isError: docsError,
  } = useKBDocuments(selectedKnowledgeBaseId, {
    pageSize: 100,
  });

  const documents = useMemo(() => documentsResponse?.documents ?? [], [documentsResponse]);
  const searchableDocuments = useMemo(() => getSearchableDocuments(documents), [documents]);
  const processingDocumentCount = useMemo(() => getProcessingDocumentCount(documents), [documents]);
  const preferredKnowledgeBaseId = useMemo(
    () => getPreferredKnowledgeBaseId(knowledgeBases),
    [knowledgeBases]
  );
  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((knowledgeBase) => knowledgeBase.id === selectedKnowledgeBaseId),
    [knowledgeBases, selectedKnowledgeBaseId]
  );
  const hasPersistableMessages = useMemo(
    () => messages.some((message) => !message.isLoading && message.content.trim().length > 0),
    [messages]
  );
  const streamBuffer = useStreamBuffer(appendToLastMessage);

  const getMessagesViewport = useCallback((): HTMLDivElement | null => {
    return messagesEndRef.current?.closest(
      '[data-slot="scroll-area-viewport"]'
    ) as HTMLDivElement | null;
  }, []);

  const updateAutoScrollState = useCallback(() => {
    const viewport = getMessagesViewport();
    if (!viewport) {
      shouldAutoScrollRef.current = true;
      return;
    }

    const isNearBottom =
      viewport.scrollTop + viewport.clientHeight >=
      viewport.scrollHeight - AUTO_SCROLL_THRESHOLD_PX;

    shouldAutoScrollRef.current = isNearBottom;
  }, [getMessagesViewport]);

  useEffect(() => {
    if (knowledgeBases.length === 0) {
      setSelectedKnowledgeBaseId(undefined);
      return;
    }

    if (
      !selectedKnowledgeBaseId ||
      !knowledgeBases.some((knowledgeBase) => knowledgeBase.id === selectedKnowledgeBaseId)
    ) {
      // Preserve an explicitly selected KB until the query cache catches up.
      if (selectedKnowledgeBaseId && selectedKnowledgeBaseId === knowledgeBaseId) {
        return;
      }
      setSelectedKnowledgeBaseId(preferredKnowledgeBaseId);
    }
  }, [knowledgeBases, knowledgeBaseId, preferredKnowledgeBaseId, selectedKnowledgeBaseId]);

  useEffect(() => {
    if (!conversationId) return;
    if (knowledgeBaseId !== (selectedKnowledgeBaseId ?? null)) {
      setSelectedKnowledgeBaseId(knowledgeBaseId ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when store values change, not when local state does
  }, [conversationId, knowledgeBaseId]);

  useEffect(() => {
    const targetKnowledgeBaseId = selectedKnowledgeBaseId ?? null;
    if (conversationId && targetKnowledgeBaseId !== knowledgeBaseId) {
      return;
    }
    if (targetKnowledgeBaseId !== knowledgeBaseId) {
      open(targetKnowledgeBaseId);
    }
  }, [conversationId, knowledgeBaseId, open, selectedKnowledgeBaseId]);

  useEffect(() => {
    if (selectedDocumentIds.length === 0) return;

    const searchableIds = new Set(searchableDocuments.map((document) => document.id));
    const nextSelected = selectedDocumentIds.filter((id) => searchableIds.has(id));

    if (nextSelected.length !== selectedDocumentIds.length) {
      setDocumentScope(nextSelected);
    }
  }, [searchableDocuments, selectedDocumentIds, setDocumentScope]);

  useEffect(() => {
    const viewport = getMessagesViewport();
    if (!viewport) return;

    const handleViewportScroll = () => {
      updateAutoScrollState();
    };

    updateAutoScrollState();
    viewport.addEventListener('scroll', handleViewportScroll, { passive: true });

    return () => {
      viewport.removeEventListener('scroll', handleViewportScroll);
    };
  }, [getMessagesViewport, messages.length, updateAutoScrollState]);

  useEffect(() => {
    if (focusMessageId || skipNextAutoScrollRef.current) {
      if (skipNextAutoScrollRef.current) {
        skipNextAutoScrollRef.current = false;
      }
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const previousMessage = messages[messages.length - 2];
    const isNewTurnWithEmptyAssistant =
      lastMessage?.role === 'assistant' &&
      lastMessage.isLoading &&
      !lastMessage.content &&
      previousMessage?.role === 'user' &&
      primedTurnAssistantIdRef.current !== lastMessage.id;

    if (isNewTurnWithEmptyAssistant) {
      primedTurnAssistantIdRef.current = lastMessage.id;
      const latestUserMessageElement = document.getElementById(
        `chat-message-${previousMessage.id}`
      );
      latestUserMessageElement?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
      return;
    }

    if (!shouldAutoScrollRef.current) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: isLoading ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [focusMessageId, getMessagesViewport, isLoading, messages]);

  useEffect(() => {
    if (!focusMessageId || messages.length === 0) return;

    const targetElement = document.getElementById(`chat-message-${focusMessageId}`);
    if (!targetElement) {
      clearFocusMessageId();
      return;
    }

    const keywordTarget = focusKeyword
      ? findFirstMatchingTextElement(targetElement, focusKeyword)
      : null;

    if (keywordTarget) {
      keywordTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } else {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setHighlightedMessageId(focusMessageId);
    shouldAutoScrollRef.current = false;
    skipNextAutoScrollRef.current = true;
    clearFocusMessageId();
  }, [clearFocusMessageId, focusKeyword, focusMessageId, messages]);

  useEffect(() => {
    if (!highlightedMessageId) return;

    const timer = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === highlightedMessageId ? null : current));
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [highlightedMessageId]);

  useEffect(() => {
    if (kbError) {
      toast.error(t('error.loadFailed'));
    }
  }, [kbError, t]);

  useEffect(() => {
    if (docsError) {
      toast.error(t('error.loadFailed'));
    }
  }, [docsError, t]);

  const handleSendMessage = useCallback(
    (content: string) => {
      const targetKnowledgeBaseId = selectedKnowledgeBaseId ?? null;
      if (knowledgeBaseId !== targetKnowledgeBaseId) {
        open(targetKnowledgeBaseId);
      }
      shouldAutoScrollRef.current = true;
      primedTurnAssistantIdRef.current = null;
      void sendMessage(content, getAccessTokenSnapshot, streamBuffer);
    },
    [knowledgeBaseId, open, selectedKnowledgeBaseId, sendMessage, streamBuffer]
  );

  const handleRetry = useCallback(
    (messageId: string) => {
      shouldAutoScrollRef.current = true;
      primedTurnAssistantIdRef.current = null;
      void retryMessage(messageId, getAccessTokenSnapshot, streamBuffer);
    },
    [retryMessage, streamBuffer]
  );

  const handleEditMessage = useCallback(
    async (messageId: string, content: string) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return;

      shouldAutoScrollRef.current = true;
      primedTurnAssistantIdRef.current = null;
      await editMessage(messageId, trimmedContent, getAccessTokenSnapshot, streamBuffer);

      const state = useChatPanelStore.getState();
      const lastMessage = state.messages[state.messages.length - 1];
      const previousMessage = state.messages[state.messages.length - 2];
      const didQueueEditedReply =
        state.isLoading &&
        lastMessage?.role === 'assistant' &&
        lastMessage.isLoading &&
        previousMessage?.role === 'user' &&
        previousMessage.content === trimmedContent;

      if (!didQueueEditedReply) {
        toast.error(t('message.editFailed'));
        throw new Error('EDIT_FAILED');
      }
    },
    [editMessage, streamBuffer, t]
  );

  const handleStopGeneration = useCallback(() => {
    streamBuffer.flush();
    stopGeneration();
  }, [stopGeneration, streamBuffer]);

  const handleCitationClick = useCallback((citation: Citation) => {
    setPreviewCitation(citation);
    setPreviewOpen(true);
  }, []);

  const handleCopyMessage = useCallback(
    async (content: string, format: CopyFormat) => {
      try {
        await copyMessageToClipboard(content, format);
        toast.success(format === 'plain' ? t('copy.plain.success') : t('copy.markdown.success'));
      } catch {
        toast.error(t('copy.error'));
      }
    },
    [t]
  );

  const handleOpenDocumentFromCitation = useCallback(
    (documentId: string) => {
      void navigate({
        to: '/documents/$id',
        params: { id: documentId },
      });
    },
    [navigate]
  );

  const handleUploadSuccess = useCallback(() => {
    setUploadDialogOpen(false);
  }, []);

  const handleOpenUploadDialog = useCallback(() => {
    setUploadDialogOpen(true);
  }, []);

  const handleOpenSaveToKbDialog = useCallback(() => {
    if (!hasPersistableMessages) {
      toast.info(t('kbSeed.none'));
      return;
    }
    setCreateKbDialogOpen(true);
  }, [hasPersistableMessages, t]);

  const handleKbSwitch = useCallback(
    (knowledgeBaseIdToUse: string) => {
      setSelectedKnowledgeBaseId(knowledgeBaseIdToUse);
      switchKnowledgeBase(knowledgeBaseIdToUse);
    },
    [switchKnowledgeBase]
  );

  return {
    kbLoading,
    docsLoading,
    conversationId,
    messages,
    selectedKnowledgeBaseId,
    selectedKnowledgeBaseName: selectedKnowledgeBase?.name,
    searchableDocuments,
    processingDocumentCount,
    selectedDocumentIds,
    hasPersistableMessages,
    isLoading,
    uploadDialogOpen,
    setUploadDialogOpen,
    previewCitation,
    previewOpen,
    setPreviewOpen,
    createKbDialogOpen,
    setCreateKbDialogOpen,
    highlightedMessageId,
    messagesEndRef,
    stopGeneration: handleStopGeneration,
    setDocumentScope,
    startNewConversation,
    clearMessages,
    handleSendMessage,
    handleRetry,
    handleEditMessage,
    handleCitationClick,
    handleCopyMessage,
    handleOpenDocumentFromCitation,
    handleUploadSuccess,
    handleOpenUploadDialog,
    handleOpenSaveToKbDialog,
    handleKbSwitch,
  };
}
