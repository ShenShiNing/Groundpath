import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useKBDocuments, useKnowledgeBases } from '@/hooks';
import { useStreamBuffer } from '@/hooks/useStreamBuffer';
import { KNOWLEDGE_BASE_DOCUMENT_PAGE_SIZE } from '@/constants/pagination';
import { copyMessageToClipboard, type CopyFormat } from '@/lib/chat';
import { getAccessTokenSnapshot, useChatPanelStore, type Citation } from '@/stores';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { getProcessingDocumentCount, getSearchableDocuments } from './utils';
import { useChatPageKnowledgeScope } from './useChatPageKnowledgeScope';
import { useChatPageScrollFocus } from './useChatPageScrollFocus';

export function useChatPageController() {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
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

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewCitation, setPreviewCitation] = useState<Citation | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [createKbDialogOpen, setCreateKbDialogOpen] = useState(false);

  const { data: knowledgeBases = [], isLoading: kbLoading, isError: kbError } = useKnowledgeBases();
  const {
    selectedKnowledgeBaseId,
    scopeSwitchDialogOpen,
    pendingKnowledgeBaseName,
    handleKnowledgeBaseChange,
    handleScopeSwitchDialogOpenChange,
    handleConfirmScopeSwitch,
    handleKbSwitch,
  } = useChatPageKnowledgeScope({
    knowledgeBases,
    knowledgeBaseId,
    conversationId,
    messages,
    open,
    startNewConversation,
    switchKnowledgeBase,
  });
  const {
    data: documentsResponse,
    isLoading: docsLoading,
    isError: docsError,
  } = useKBDocuments(selectedKnowledgeBaseId ?? undefined, {
    pageSize: KNOWLEDGE_BASE_DOCUMENT_PAGE_SIZE,
  });

  const documents = useMemo(() => documentsResponse?.documents ?? [], [documentsResponse]);
  const searchableDocuments = useMemo(() => getSearchableDocuments(documents), [documents]);
  const processingDocumentCount = useMemo(() => getProcessingDocumentCount(documents), [documents]);
  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((knowledgeBase) => knowledgeBase.id === selectedKnowledgeBaseId),
    [knowledgeBases, selectedKnowledgeBaseId]
  );
  const hasPersistableMessages = useMemo(
    () => messages.some((message) => !message.isLoading && message.content.trim().length > 0),
    [messages]
  );
  const streamBuffer = useStreamBuffer(appendToLastMessage);

  const ensureMessageVisibleRef = useRef<((messageId: string) => void) | null>(null);
  const ensureMessageVisible = useCallback((messageId: string) => {
    ensureMessageVisibleRef.current?.(messageId);
  }, []);

  const { messagesEndRef, prepareForAssistantStream } = useChatPageScrollFocus({
    messages,
    isLoading,
    focusMessageId,
    focusKeyword,
    clearFocusMessageId,
    ensureMessageVisible,
  });

  useEffect(() => {
    if (selectedDocumentIds.length === 0) return;

    const searchableIds = new Set(searchableDocuments.map((document) => document.id));
    const nextSelected = selectedDocumentIds.filter((id) => searchableIds.has(id));

    if (nextSelected.length !== selectedDocumentIds.length) {
      setDocumentScope(nextSelected);
    }
  }, [searchableDocuments, selectedDocumentIds, setDocumentScope]);

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
      prepareForAssistantStream();
      void sendMessage(content, getAccessTokenSnapshot, streamBuffer);
    },
    [
      knowledgeBaseId,
      open,
      prepareForAssistantStream,
      selectedKnowledgeBaseId,
      sendMessage,
      streamBuffer,
    ]
  );

  const handleRetry = useCallback(
    (messageId: string) => {
      prepareForAssistantStream();
      void retryMessage(messageId, getAccessTokenSnapshot, streamBuffer);
    },
    [prepareForAssistantStream, retryMessage, streamBuffer]
  );

  const handleEditMessage = useCallback(
    async (messageId: string, content: string) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return;

      prepareForAssistantStream();
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
    [editMessage, prepareForAssistantStream, streamBuffer, t]
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

  return {
    kbLoading,
    knowledgeBases,
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
    highlightedMessageId: focusMessageId,
    scopeSwitchDialogOpen,
    setScopeSwitchDialogOpen: handleScopeSwitchDialogOpenChange,
    pendingKnowledgeBaseName,
    messagesEndRef,
    ensureMessageVisibleRef,
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
    handleKnowledgeBaseChange,
    handleConfirmScopeSwitch,
    handleKbSwitch,
  };
}
