import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Database, FileText, History, Sparkles, StopCircle, Trash2, Upload } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ChatInput,
  ChatMessage,
  CitationPreview,
  ConversationList,
  DocumentScopeSelector,
} from '@/components/knowledge-bases/chat';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { useKBDocuments, useKnowledgeBases } from '@/hooks';
import { useAuthStore, useChatPanelStore } from '@/stores';
import type { Citation } from '@/stores/chatPanelStore';

export function ChatPage() {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string | undefined>(
    useChatPanelStore.getState().knowledgeBaseId ?? undefined
  );
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [conversationSheetOpen, setConversationSheetOpen] = useState(false);
  const [previewCitation, setPreviewCitation] = useState<Citation | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: knowledgeBases = [], isLoading: kbLoading } = useKnowledgeBases();
  const { data: documentsResponse, isLoading: docsLoading } = useKBDocuments(
    selectedKnowledgeBaseId,
    {
      pageSize: 100,
    }
  );

  const {
    knowledgeBaseId,
    conversationId,
    messages,
    selectedDocumentIds,
    isLoading,
    open,
    sendMessage,
    stopGeneration,
    setDocumentScope,
    clearMessages,
    startNewConversation,
    switchConversation,
  } = useChatPanelStore();

  const documents = useMemo(() => documentsResponse?.documents ?? [], [documentsResponse]);
  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((kb) => kb.id === selectedKnowledgeBaseId),
    [knowledgeBases, selectedKnowledgeBaseId]
  );

  useEffect(() => {
    if (knowledgeBases.length === 0) {
      setSelectedKnowledgeBaseId(undefined);
      return;
    }

    if (
      !selectedKnowledgeBaseId ||
      !knowledgeBases.some((kb) => kb.id === selectedKnowledgeBaseId)
    ) {
      setSelectedKnowledgeBaseId(knowledgeBases[0]!.id);
    }
  }, [knowledgeBases, selectedKnowledgeBaseId]);

  useEffect(() => {
    if (selectedKnowledgeBaseId && selectedKnowledgeBaseId !== knowledgeBaseId) {
      open(selectedKnowledgeBaseId);
    }
  }, [knowledgeBaseId, open, selectedKnowledgeBaseId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getAccessToken = useCallback(() => useAuthStore.getState().accessToken, []);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!selectedKnowledgeBaseId) return;
      if (knowledgeBaseId !== selectedKnowledgeBaseId) {
        open(selectedKnowledgeBaseId);
      }
      void sendMessage(content, getAccessToken);
    },
    [getAccessToken, knowledgeBaseId, open, selectedKnowledgeBaseId, sendMessage]
  );

  const handleCitationClick = useCallback((citation: Citation) => {
    setPreviewCitation(citation);
    setPreviewOpen(true);
  }, []);

  const handleCopyMessage = useCallback((content: string) => {
    void navigator.clipboard.writeText(content);
  }, []);

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

  const handleSelectConversation = useCallback(
    (nextConversationId: string) => {
      void switchConversation(nextConversationId);
      setConversationSheetOpen(false);
    },
    [switchConversation]
  );

  if (kbLoading) {
    return (
      <AppLayout>
        <div className="flex-1 overflow-hidden bg-background px-6 py-8">
          <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-112 rounded-2xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (knowledgeBases.length === 0) {
    return (
      <AppLayout>
        <div className="flex-1 overflow-y-auto bg-background px-6 py-8 md:py-10">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border bg-card/70 p-8 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
              <Database className="size-6 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold">还没有可用知识库</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              先创建知识库并上传文档，再开始多轮问答。
            </p>
            <Button className="mt-6 cursor-pointer" asChild>
              <Link to="/knowledge-bases">前往创建知识库</Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <a
        href="#chat-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        跳转到聊天内容
      </a>

      <div className="relative flex-1 overflow-hidden bg-background px-4 py-4 md:px-6 md:py-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-72 w-2xl -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
          <header className="rounded-2xl border bg-card/70 p-4 md:p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Workspace / Chat</p>
                <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight">
                  知识库聊天
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  聚焦提问与引用答案，已隐藏会话列表与知识库选择器。
                </p>
              </div>

              <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  className="cursor-pointer"
                  onClick={startNewConversation}
                  disabled={!selectedKnowledgeBaseId}
                >
                  <Sparkles className="size-4 mr-2" />
                  新会话
                </Button>
                <Button
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => setConversationSheetOpen(true)}
                  disabled={!selectedKnowledgeBaseId}
                >
                  <History className="size-4 mr-2" />
                  历史会话
                </Button>
                <Button
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => setUploadDialogOpen(true)}
                  disabled={!selectedKnowledgeBaseId}
                >
                  <Upload className="size-4 mr-2" />
                  上传文件
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Database className="size-3.5" />
                {selectedKnowledgeBase?.name ?? '未选择'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileText className="size-3.5" />
                {selectedKnowledgeBase?.documentCount ?? 0} 份文档
              </span>
              <span>{messages.length} 条消息</span>
              {selectedKnowledgeBaseId && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                  <Link to={`/knowledge-bases/${selectedKnowledgeBaseId}` as string}>
                    查看知识库详情
                  </Link>
                </Button>
              )}
            </div>
          </header>

          <section id="chat-main" className="min-h-0 flex-1 rounded-2xl border bg-card/80">
            <div className="flex h-full min-h-88 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-3">
                <DocumentScopeSelector
                  documents={documents}
                  selectedIds={selectedDocumentIds}
                  onChange={setDocumentScope}
                />
                <span className="text-xs text-muted-foreground">
                  {docsLoading ? '文档加载中...' : `当前可检索 ${documents.length} 份文档`}
                </span>

                <div className="ml-auto flex items-center gap-1">
                  {isLoading && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 cursor-pointer"
                      onClick={stopGeneration}
                      title="停止生成"
                    >
                      <StopCircle className="size-4 text-destructive" />
                    </Button>
                  )}
                  {messages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 cursor-pointer"
                      onClick={clearMessages}
                      title="清空聊天"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  {messages.length === 0 ? (
                    <div className="flex h-full min-h-96 items-center justify-center px-4 py-5 md:px-6">
                      <div className="mx-auto flex max-w-md flex-col items-center text-center">
                        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10">
                          <Sparkles className="size-6 text-primary" />
                        </div>
                        <h3 className="text-base font-semibold">开始你的第一条提问</h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                          你可以先点击“上传文件”，然后询问摘要、结论、出处对比等问题。
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-4xl px-4 py-5 md:px-6">
                      <>
                        {messages.map((message) => (
                          <ChatMessage
                            key={message.id}
                            message={message}
                            onCitationClick={handleCitationClick}
                            onCopy={() => handleCopyMessage(message.content)}
                          />
                        ))}
                        <div ref={messagesEndRef} />
                      </>
                    </div>
                  )}
                </ScrollArea>
              </div>

              <div className="shrink-0 border-t bg-background/80">
                <div className="mx-auto max-w-4xl">
                  <ChatInput
                    onSend={handleSendMessage}
                    disabled={isLoading || !selectedKnowledgeBaseId}
                    placeholder={
                      selectedKnowledgeBaseId
                        ? '输入你的问题，Enter 发送，Shift+Enter 换行...'
                        : '当前没有可用知识库'
                    }
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Sheet open={conversationSheetOpen} onOpenChange={setConversationSheetOpen}>
        <SheetContent side="right" className="p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>历史会话</SheetTitle>
            <SheetDescription>查看并切换当前知识库下的对话记录</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <ConversationList
              knowledgeBaseId={selectedKnowledgeBaseId}
              currentConversationId={conversationId}
              onSelect={handleSelectConversation}
              onNewConversation={startNewConversation}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>上传文档到知识库</DialogTitle>
            <DialogDescription>
              上传完成后可立即用于检索和对话引用。支持 PDF、Markdown、TXT、DOCX。
            </DialogDescription>
          </DialogHeader>
          <DocumentUpload
            knowledgeBaseId={selectedKnowledgeBaseId}
            onSuccess={handleUploadSuccess}
          />
        </DialogContent>
      </Dialog>

      <CitationPreview
        citation={previewCitation}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onOpenDocument={handleOpenDocumentFromCitation}
      />
    </AppLayout>
  );
}

export default ChatPage;
