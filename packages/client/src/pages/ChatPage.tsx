import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Database, Ellipsis, FileText, Loader2, Sparkles, Trash2, Upload } from 'lucide-react';
import type { EmbeddingProviderType } from '@knowledge-agent/shared/types';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { ChatInput, ChatMessage, CitationPreview, DocumentScopeSelector } from '@/components/chat';
import { copyMessageToClipboard, type CopyFormat } from '@/lib/chat';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { knowledgeBasesApi } from '@/api';
import { useCreateKnowledgeBase, useKBDocuments, useKnowledgeBases } from '@/hooks';
import { useAuthStore, useChatPanelStore } from '@/stores';
import type { Citation } from '@/stores/chatPanelStore';
import { toast } from 'sonner';

type KnowledgeSeedSource = 'conversation' | 'latest-assistant';

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

function buildConversationMarkdown(
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>
): string {
  const body = messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => {
      const title = message.role === 'user' ? 'User' : 'Assistant';
      const time = message.timestamp.toISOString();
      return `## ${title} (${time})\n\n${message.content.trim()}\n`;
    })
    .join('\n');

  return `# Chat Transcript\n\n${body}`.trim();
}

export function ChatPage() {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState<string | undefined>(
    useChatPanelStore.getState().knowledgeBaseId ?? undefined
  );
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewCitation, setPreviewCitation] = useState<Citation | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [createKbDialogOpen, setCreateKbDialogOpen] = useState(false);
  const [newKbName, setNewKbName] = useState('');
  const [newKbDescription, setNewKbDescription] = useState('');
  const [newKbEmbeddingProvider, setNewKbEmbeddingProvider] =
    useState<EmbeddingProviderType>('zhipu');
  const [seedSource, setSeedSource] = useState<KnowledgeSeedSource>('conversation');
  const [switchToNewKb, setSwitchToNewKb] = useState(true);
  const [isCreatingKb, setIsCreatingKb] = useState(false);

  const { data: knowledgeBases = [], isLoading: kbLoading } = useKnowledgeBases();
  const createKnowledgeBase = useCreateKnowledgeBase();
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
  } = useChatPanelStore();

  const documents = useMemo(() => documentsResponse?.documents ?? [], [documentsResponse]);
  const searchableDocuments = useMemo(
    () => documents.filter((doc) => doc.processingStatus === 'completed'),
    [documents]
  );
  const processingDocumentCount = useMemo(
    () =>
      documents.filter(
        (doc) => doc.processingStatus === 'pending' || doc.processingStatus === 'processing'
      ).length,
    [documents]
  );
  const preferredKnowledgeBaseId = useMemo(() => {
    if (knowledgeBases.length === 0) return undefined;

    const sortedByUpdated = [...knowledgeBases].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return sortedByUpdated.find((kb) => kb.documentCount > 0)?.id ?? sortedByUpdated[0]!.id;
  }, [knowledgeBases]);
  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((kb) => kb.id === selectedKnowledgeBaseId),
    [knowledgeBases, selectedKnowledgeBaseId]
  );
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
  const hasPersistableMessages = useMemo(
    () => messages.some((message) => !message.isLoading && message.content.trim().length > 0),
    [messages]
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
      setSelectedKnowledgeBaseId(preferredKnowledgeBaseId);
    }
  }, [knowledgeBases, preferredKnowledgeBaseId, selectedKnowledgeBaseId]);

  // Keep local selected KB in sync when conversation is switched from outside ChatPage (e.g. sidebar)
  useEffect(() => {
    if (!conversationId) return;
    const currentSelected = selectedKnowledgeBaseId ?? null;
    if (knowledgeBaseId !== currentSelected) {
      setSelectedKnowledgeBaseId(knowledgeBaseId ?? undefined);
    }
  }, [conversationId, knowledgeBaseId, selectedKnowledgeBaseId]);

  useEffect(() => {
    const targetKnowledgeBaseId = selectedKnowledgeBaseId ?? null;
    // Avoid overriding externally-loaded conversation context
    if (conversationId && targetKnowledgeBaseId !== knowledgeBaseId) {
      return;
    }
    if (targetKnowledgeBaseId !== knowledgeBaseId) {
      open(targetKnowledgeBaseId);
    }
  }, [conversationId, knowledgeBaseId, open, selectedKnowledgeBaseId]);

  useEffect(() => {
    if (selectedDocumentIds.length === 0) return;
    const searchableIds = new Set(searchableDocuments.map((doc) => doc.id));
    const nextSelected = selectedDocumentIds.filter((id) => searchableIds.has(id));
    if (nextSelected.length !== selectedDocumentIds.length) {
      setDocumentScope(nextSelected);
    }
  }, [searchableDocuments, selectedDocumentIds, setDocumentScope]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getAccessToken = useCallback(() => useAuthStore.getState().accessToken, []);

  const handleSendMessage = useCallback(
    (content: string) => {
      const targetKnowledgeBaseId = selectedKnowledgeBaseId ?? null;
      if (knowledgeBaseId !== targetKnowledgeBaseId) {
        open(targetKnowledgeBaseId);
      }
      void sendMessage(content, getAccessToken);
    },
    [getAccessToken, knowledgeBaseId, open, selectedKnowledgeBaseId, sendMessage]
  );

  const handleCitationClick = useCallback((citation: Citation) => {
    setPreviewCitation(citation);
    setPreviewOpen(true);
  }, []);

  const handleCopyMessage = useCallback(async (content: string, format: CopyFormat) => {
    try {
      await copyMessageToClipboard(content, format);
      toast.success(format === 'plain' ? '已复制纯文本' : '已复制 Markdown');
    } catch {
      toast.error('复制失败，请重试');
    }
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

  const handleOpenCreateKbDialog = useCallback(() => {
    if (!hasPersistableMessages) {
      toast.info('当前还没有可沉淀的聊天内容');
      return;
    }

    const defaultName =
      selectedKnowledgeBase?.name ?? `Chat Knowledge Base ${new Date().toISOString().slice(0, 10)}`;
    setNewKbName(defaultName);
    setNewKbDescription('');
    setNewKbEmbeddingProvider('zhipu');
    setSeedSource(latestAssistantMessage ? 'latest-assistant' : 'conversation');
    setSwitchToNewKb(true);
    setCreateKbDialogOpen(true);
  }, [hasPersistableMessages, latestAssistantMessage, selectedKnowledgeBase?.name]);

  const handleCreateKbFromChat = useCallback(async () => {
    if (!newKbName.trim()) {
      toast.error('请输入知识库名称');
      return;
    }

    if (seedSource === 'latest-assistant' && !latestAssistantMessage) {
      toast.error('当前没有可用的 AI 回复内容');
      return;
    }

    const conversationContent = buildConversationMarkdown(
      messages
        .filter((message) => !message.isLoading)
        .map((message) => ({
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
        }))
    );
    const latestAssistantContent = latestAssistantMessage?.content.trim() ?? '';
    const selectedContent =
      seedSource === 'latest-assistant' ? latestAssistantContent : conversationContent;

    if (!selectedContent.trim()) {
      toast.error('没有可保存的内容');
      return;
    }

    setIsCreatingKb(true);
    try {
      const knowledgeBase = await createKnowledgeBase.mutateAsync({
        name: newKbName.trim(),
        description: newKbDescription.trim() || null,
        embeddingProvider: newKbEmbeddingProvider,
      });

      const documentTitle =
        seedSource === 'latest-assistant' ? 'AI Generated Notes' : 'Chat Transcript';
      const fileBaseName = sanitizeFileName(documentTitle || knowledgeBase.name) || 'chat-notes';
      const file = new File([selectedContent], `${fileBaseName}.md`, {
        type: 'text/markdown',
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', documentTitle);
      formData.append('description', 'Generated from chat content');

      await knowledgeBasesApi.uploadDocument(knowledgeBase.id, formData);

      if (switchToNewKb) {
        setSelectedKnowledgeBaseId(knowledgeBase.id);
        open(knowledgeBase.id);
        startNewConversation();
      }

      setCreateKbDialogOpen(false);
      toast.success('知识库创建成功，聊天内容已保存为文档');
    } catch {
      toast.error('创建知识库失败，请重试');
    } finally {
      setIsCreatingKb(false);
    }
  }, [
    createKnowledgeBase,
    latestAssistantMessage,
    messages,
    newKbDescription,
    newKbEmbeddingProvider,
    newKbName,
    open,
    seedSource,
    startNewConversation,
    switchToNewKb,
  ]);

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

  return (
    <AppLayout>
      <a
        href="#chat-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        跳转到聊天内容
      </a>

      <div className="relative flex-1 overflow-hidden bg-background">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-64 w-2xl -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
          <section id="chat-main" className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-full min-h-88 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-6">
                {selectedKnowledgeBaseId ? (
                  <DocumentScopeSelector
                    documents={searchableDocuments}
                    selectedIds={selectedDocumentIds}
                    onChange={setDocumentScope}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">通用模式</span>
                )}
                <span
                  className={`text-xs ${
                    selectedKnowledgeBaseId && searchableDocuments.length === 0
                      ? 'text-amber-600'
                      : 'text-muted-foreground'
                  }`}
                >
                  {!selectedKnowledgeBaseId
                    ? '通用聊天模式不限定文档范围'
                    : docsLoading
                      ? '文档加载中...'
                      : processingDocumentCount > 0
                        ? `当前可检索 ${searchableDocuments.length} 份文档，另有 ${processingDocumentCount} 份处理中`
                        : `当前可检索 ${searchableDocuments.length} 份文档`}
                </span>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-8 cursor-pointer"
                      title="聊天操作"
                    >
                      <Ellipsis className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem className="cursor-pointer" onClick={startNewConversation}>
                      <Sparkles className="size-4" />
                      新会话
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setUploadDialogOpen(true)}
                      disabled={!selectedKnowledgeBaseId}
                    >
                      <Upload className="size-4" />
                      上传文件
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={handleOpenCreateKbDialog}
                      disabled={!hasPersistableMessages}
                    >
                      <Database className="size-4" />
                      沉淀为知识库
                    </DropdownMenuItem>
                    {selectedKnowledgeBaseId && (
                      <DropdownMenuItem asChild className="cursor-pointer">
                        <Link to={`/knowledge-bases/${selectedKnowledgeBaseId}` as string}>
                          <FileText className="size-4" />
                          查看知识库详情
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      variant="destructive"
                      className="cursor-pointer"
                      onClick={clearMessages}
                      disabled={messages.length === 0}
                    >
                      <Trash2 className="size-4" />
                      清空聊天
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="min-h-0 flex-1">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-4 py-8 md:px-6">
                    <div className="mx-auto flex max-w-lg flex-col items-center text-center">
                      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                        <Sparkles className="size-6 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold">开始你的第一条提问</h3>
                      <p className="mt-2 max-w-md text-sm text-muted-foreground">
                        {selectedKnowledgeBaseId
                          ? '你可以先点击“上传文件”，然后询问摘要、结论、出处对比等问题。'
                          : '你可以先直接聊天，之后手动将聊天内容沉淀为知识库。'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
                      {messages.map((message) => (
                        <ChatMessage
                          key={message.id}
                          message={message}
                          onCitationClick={handleCitationClick}
                          onCopy={(format) => handleCopyMessage(message.content, format)}
                        />
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                )}
              </div>

              <div className="shrink-0 bg-background pb-4 pt-2 md:pb-6">
                <div className="mx-auto w-full max-w-3xl px-4 md:px-6">
                  <ChatInput
                    onSend={handleSendMessage}
                    onStop={stopGeneration}
                    isGenerating={isLoading}
                    disabled={isLoading}
                    placeholder={
                      selectedKnowledgeBaseId
                        ? '输入你的问题，Enter 发送，Shift+Enter 换行...'
                        : '通用聊天模式：直接提问，后续可将内容沉淀为知识库...'
                    }
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={createKbDialogOpen} onOpenChange={setCreateKbDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>从聊天内容创建知识库</DialogTitle>
            <DialogDescription>手动选择内容来源并创建知识库，不会自动触发创建。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="chat-kb-name">知识库名称</Label>
              <Input
                id="chat-kb-name"
                value={newKbName}
                onChange={(event) => setNewKbName(event.target.value)}
                placeholder="My Chat Knowledge Base"
                maxLength={200}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="chat-kb-description">知识库描述</Label>
              <Textarea
                id="chat-kb-description"
                value={newKbDescription}
                onChange={(event) => setNewKbDescription(event.target.value)}
                placeholder="可选：记录该知识库用途"
                maxLength={2000}
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="chat-kb-provider">Embedding Provider</Label>
              <Select
                value={newKbEmbeddingProvider}
                onValueChange={(value) => setNewKbEmbeddingProvider(value as EmbeddingProviderType)}
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

            <div className="grid gap-2">
              <Label htmlFor="chat-seed-source">内容来源</Label>
              <Select
                value={seedSource}
                onValueChange={(value) => setSeedSource(value as KnowledgeSeedSource)}
              >
                <SelectTrigger id="chat-seed-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversation">完整聊天记录</SelectItem>
                  <SelectItem value="latest-assistant" disabled={!latestAssistantMessage}>
                    最新 AI 回复内容
                  </SelectItem>
                </SelectContent>
              </Select>
              {seedSource === 'latest-assistant' && !latestAssistantMessage && (
                <p className="text-xs text-amber-600">暂无可用 AI 回复，请先完成至少一次问答。</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="switch-to-new-kb"
                checked={switchToNewKb}
                onCheckedChange={(checked) => setSwitchToNewKb(checked === true)}
              />
              <Label htmlFor="switch-to-new-kb" className="text-sm">
                创建完成后切换到该知识库
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateKbDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleCreateKbFromChat()} disabled={isCreatingKb}>
              {isCreatingKb ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  创建中...
                </>
              ) : (
                '创建知识库并保存内容'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
