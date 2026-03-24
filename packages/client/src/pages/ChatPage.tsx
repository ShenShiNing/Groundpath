import { ChatInput } from '@/components/chat';
import { useTranslation } from 'react-i18next';
import { ChatPageConversation } from './chat-page/ChatPageConversation';
import { ChatPageDialogs } from './chat-page/ChatPageDialogs';
import { ChatPageLoadingState } from './chat-page/ChatPageLoadingState';
import { ChatPageToolbar } from './chat-page/ChatPageToolbar';
import { useChatPageController } from './chat-page/useChatPageController';

export function ChatPage() {
  const { t } = useTranslation('chat');
  const {
    kbLoading,
    knowledgeBases,
    docsLoading,
    conversationId,
    messages,
    selectedKnowledgeBaseId,
    selectedKnowledgeBaseName,
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
    scopeSwitchDialogOpen,
    setScopeSwitchDialogOpen,
    pendingKnowledgeBaseName,
    messagesEndRef,
    stopGeneration,
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
  } = useChatPageController();

  if (kbLoading) {
    return <ChatPageLoadingState />;
  }

  return (
    <>
      <a
        href="#chat-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t('skipToContent')}
      </a>

      <div className="flex-1 overflow-hidden bg-background">
        <div className="flex h-full w-full flex-col">
          <section id="chat-main" className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-full min-h-88 flex-col">
              <ChatPageToolbar
                knowledgeBases={knowledgeBases}
                selectedKnowledgeBaseId={selectedKnowledgeBaseId}
                searchableDocuments={searchableDocuments}
                selectedDocumentIds={selectedDocumentIds}
                docsLoading={docsLoading}
                processingDocumentCount={processingDocumentCount}
                hasPersistableMessages={hasPersistableMessages}
                messageCount={messages.length}
                isGenerating={isLoading}
                onKnowledgeBaseChange={handleKnowledgeBaseChange}
                onDocumentScopeChange={setDocumentScope}
                onNewConversation={startNewConversation}
                onOpenUploadDialog={handleOpenUploadDialog}
                onOpenSaveToKbDialog={handleOpenSaveToKbDialog}
                onClearChat={clearMessages}
              />

              <ChatPageConversation
                messages={messages}
                selectedKnowledgeBaseId={selectedKnowledgeBaseId}
                highlightedMessageId={highlightedMessageId}
                messagesEndRef={messagesEndRef}
                isLoading={isLoading}
                onCitationClick={handleCitationClick}
                onCopyMessage={handleCopyMessage}
                onRetry={handleRetry}
                onEditMessage={handleEditMessage}
              />

              <div className="shrink-0 bg-gradient-to-t from-background via-background to-transparent pb-4 pt-3 md:pb-6">
                <div className="mx-auto w-full max-w-3xl px-4 md:px-6">
                  <ChatInput
                    onSend={handleSendMessage}
                    onStop={stopGeneration}
                    isGenerating={isLoading}
                    disabled={isLoading}
                    placeholder={
                      selectedKnowledgeBaseId
                        ? t('input.placeholder.withKb')
                        : t('input.placeholder.general')
                    }
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <ChatPageDialogs
        createKbDialogOpen={createKbDialogOpen}
        onCreateKbDialogOpenChange={setCreateKbDialogOpen}
        messages={messages}
        conversationId={conversationId}
        selectedKnowledgeBaseId={selectedKnowledgeBaseId}
        selectedKnowledgeBaseName={selectedKnowledgeBaseName}
        onKbSwitch={handleKbSwitch}
        scopeSwitchDialogOpen={scopeSwitchDialogOpen}
        onScopeSwitchDialogOpenChange={setScopeSwitchDialogOpen}
        pendingScopeName={pendingKnowledgeBaseName}
        onConfirmScopeSwitch={handleConfirmScopeSwitch}
        uploadDialogOpen={uploadDialogOpen}
        onUploadDialogOpenChange={setUploadDialogOpen}
        onUploadSuccess={handleUploadSuccess}
        previewCitation={previewCitation}
        previewOpen={previewOpen}
        onPreviewOpenChange={setPreviewOpen}
        onOpenDocumentFromCitation={handleOpenDocumentFromCitation}
      />
    </>
  );
}

export default ChatPage;
