import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type {
  Citation,
  MessageMetadata,
  SSEEvent,
  ToolCallInfo,
  ToolResultInfo,
} from '@knowledge-agent/shared/types';
import { CHAT_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { llmService } from '@modules/llm';
import { searchService } from '@modules/rag';
import type { SearchResult } from '@modules/vector';
import { documentRepository } from '@modules/document';
import { resolveTools, executeAgentLoop } from '@modules/agent';
import { ragConfig } from '@config/env';
import { structuredRagMetrics } from '@shared/observability';
import { conversationService } from './conversation.service';
import { messageService } from './message.service';
import { promptService } from './prompt.service';
import { conversationRepository } from '../repositories/conversation.repository';
import { createLogger } from '@shared/logger';

const logger = createLogger('chat.service');
const PROVIDER_ERROR_FALLBACK_CONTENT =
  'The model provider failed before the answer could be completed. Please try again.';

interface SendMessageOptions {
  userId: string;
  conversationId: string;
  content: string;
  documentIds?: string[];
}

interface EnrichedSearchResult {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  score: number;
  metadata?: {
    pageNumber?: number;
  };
}

interface AgentExecutionContext {
  conversationId: string;
  content: string;
  userId: string;
  documentIds?: string[];
  knowledgeBaseId: string | null;
  provider: Awaited<ReturnType<typeof llmService.getProviderForUser>>;
  genOptions: Awaited<ReturnType<typeof llmService.getOptionsForUser>>;
}

function buildCitationMetadata(
  finalCitations?: Citation[],
  extras?: Pick<MessageMetadata, 'agentTrace' | 'stopReason' | 'tokenUsage'> & {
    retrievedSources?: Citation[];
  }
): MessageMetadata | undefined {
  if (
    !finalCitations?.length &&
    !extras?.retrievedSources?.length &&
    !extras?.agentTrace?.length &&
    !extras?.stopReason &&
    !extras?.tokenUsage
  ) {
    return undefined;
  }

  return {
    citations: finalCitations,
    retrievedSources: extras?.retrievedSources ?? finalCitations,
    finalCitations,
    ...extras,
  };
}

function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function enrichSearchResults(results: SearchResult[]): Promise<EnrichedSearchResult[]> {
  if (results.length === 0) return [];

  const docIds = [...new Set(results.map((r) => r.documentId))];
  const docTitles = await documentRepository.getTitlesByIds(docIds);

  return results.map((r) => ({
    documentId: r.documentId,
    documentTitle: docTitles.get(r.documentId) ?? 'Unknown Document',
    chunkIndex: r.chunkIndex,
    content: r.content,
    score: r.score,
    metadata: {},
  }));
}

async function executeAgentConversation(
  ctx: AgentExecutionContext,
  tools: ReturnType<typeof resolveTools>,
  callbacks?: {
    onToolStart?: (stepIndex: number, toolCalls: ToolCallInfo[]) => void;
    onToolEnd?: (stepIndex: number, toolResults: ToolResultInfo[], durationMs: number) => void;
  }
) {
  const { conversationId, content, userId, provider, genOptions, knowledgeBaseId, documentIds } =
    ctx;
  const hasKnowledgeBase = !!knowledgeBaseId;
  const hasWebSearch = tools.some((t) => t.definition.name === 'web_search');
  const hasStructuredKnowledgeBase = tools.some((t) => t.definition.name === 'outline_search');

  logger.debug(
    {
      conversationId,
      toolCount: tools.length,
      hasKnowledgeBase,
      hasStructuredKnowledgeBase,
      hasWebSearch,
      provider: provider.name,
    },
    'Using agent mode'
  );

  const history = await messageService.getRecentForContext(conversationId, 10);
  const truncatedHistory = promptService.truncateHistory(history, 4000);
  const systemPrompt = promptService.buildAgentSystemPrompt({
    hasKnowledgeBase,
    hasWebSearch,
    hasStructuredKnowledgeBase,
  });
  const messages = promptService.buildChatMessages(systemPrompt, truncatedHistory, content);

  return executeAgentLoop({
    provider,
    messages,
    tools,
    toolContext: {
      userId,
      conversationId,
      knowledgeBaseId: knowledgeBaseId ?? undefined,
      documentIds,
      runtimeState: {},
    },
    genOptions,
    onToolStart: callbacks?.onToolStart,
    onToolEnd: callbacks?.onToolEnd,
  });
}

function sendChunkedSSE(res: Response, content: string, chunkSize: number = 80): void {
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    sendSSE(res, { type: 'chunk', data: chunk });
  }
}

async function persistAssistantMessage(input: {
  messageId: string;
  conversationId: string;
  content: string;
  citations?: Citation[];
  retrievedSources?: Citation[];
  agentTrace?: MessageMetadata['agentTrace'];
  stopReason?: MessageMetadata['stopReason'];
}) {
  await messageService.create({
    id: input.messageId,
    conversationId: input.conversationId,
    role: 'assistant',
    content: input.content,
    metadata: buildCitationMetadata(input.citations, {
      retrievedSources: input.retrievedSources,
      agentTrace: input.agentTrace,
      stopReason: input.stopReason,
    }),
  });
}

/** Shared context passed to mode-specific execution functions */
interface StreamContext {
  res: Response;
  userId: string;
  conversationId: string;
  content: string;
  documentIds?: string[];
  assistantMessageId: string;
  knowledgeBaseId: string | null;
  provider: Awaited<ReturnType<typeof llmService.getProviderForUser>>;
  genOptions: Awaited<ReturnType<typeof llmService.getOptionsForUser>>;
  abortController: AbortController;
  isDisconnected: () => boolean;
  completionStopReason?: MessageMetadata['stopReason'];
}

export const chatService = {
  /**
   * Send a message and stream the response via SSE
   */
  async sendMessageWithSSE(res: Response, options: SendMessageOptions): Promise<void> {
    const { userId, conversationId, content, documentIds } = options;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const conversation = await conversationService.validateOwnership(userId, conversationId);

      await messageService.create({ conversationId, role: 'user', content });

      const messageCount = await messageService.count(conversationId);
      if (messageCount === 1) {
        const title = conversationService.generateTitle(content);
        await conversationRepository.update(conversationId, { title, updatedBy: userId });
      }

      const toolContext = {
        userId,
        conversationId,
        knowledgeBaseId: conversation.knowledgeBaseId,
        documentIds,
      };
      const tools = resolveTools(toolContext);

      const provider = await llmService.getProviderForUser(userId);
      const genOptions = await llmService.getOptionsForUser(userId);

      const assistantMessageId = uuidv4();
      const abortController = new AbortController();
      let clientDisconnected = false;

      const onClose = () => {
        clientDisconnected = true;
        abortController.abort();
        logger.info({ conversationId }, 'Client disconnected, aborting');
      };
      res.on('close', onClose);

      const ctx: StreamContext = {
        res,
        userId,
        conversationId,
        content,
        documentIds,
        assistantMessageId,
        knowledgeBaseId: conversation.knowledgeBaseId,
        provider,
        genOptions,
        abortController,
        isDisconnected: () => clientDisconnected,
        completionStopReason: undefined,
      };

      try {
        const useAgentMode = tools.length > 0 && !!provider.generateWithTools;
        if (useAgentMode) {
          await this.executeAgentMode(ctx, tools);
        } else {
          await this.executeLegacyStreamMode(ctx);
        }
      } finally {
        res.off('close', onClose);
      }

      if (clientDisconnected) return;

      await conversationRepository.touch(conversationId, userId);
      sendSSE(res, {
        type: 'done',
        data: { messageId: assistantMessageId, stopReason: ctx.completionStopReason },
      });
      res.end();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info({ conversationId }, 'Chat request aborted');
        return;
      }

      logger.error({ err: error, conversationId }, 'Chat service error');

      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
      }
      sendSSE(res, {
        type: 'error',
        data: {
          code:
            error instanceof Error && 'code' in error
              ? (error as { code: string }).code
              : 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      });
      res.end();
    }
  },

  /**
   * Agentic RAG mode — LLM autonomously orchestrates tool calls
   */
  async executeAgentMode(
    ctx: StreamContext,
    tools: ReturnType<typeof resolveTools>
  ): Promise<void> {
    const { res, conversationId, content, userId, provider, genOptions, abortController } = ctx;
    const agentResult = await executeAgentConversation(
      {
        conversationId,
        content,
        userId,
        documentIds: ctx.documentIds,
        knowledgeBaseId: ctx.knowledgeBaseId,
        provider,
        genOptions: { ...genOptions, signal: abortController.signal },
      },
      tools,
      {
        onToolStart: (stepIndex, toolCalls) => {
          if (!ctx.isDisconnected()) {
            sendSSE(res, { type: 'tool_start', data: { stepIndex, toolCalls } });
          }
        },
        onToolEnd: (stepIndex, toolResults, durationMs) => {
          if (!ctx.isDisconnected()) {
            sendSSE(res, { type: 'tool_end', data: { stepIndex, toolResults, durationMs } });
          }
        },
      }
    );

    if (ctx.isDisconnected()) return;
    ctx.completionStopReason = agentResult.stopReason;

    if (agentResult.citations.length > 0) {
      sendSSE(res, { type: 'sources', data: agentResult.citations });
    }
    if (agentResult.content) {
      sendChunkedSSE(res, agentResult.content);
    }

    if (!agentResult.content.trim()) {
      logger.warn({ conversationId, userId }, 'Agent returned empty content');
      sendSSE(res, {
        type: 'error',
        data: {
          code: CHAT_ERROR_CODES.STREAMING_FAILED,
          message: 'The model returned an empty response. Please try again.',
        },
      });
      res.end();
      return;
    }

    await persistAssistantMessage({
      messageId: ctx.assistantMessageId,
      conversationId,
      content: agentResult.content,
      citations: agentResult.citations.length > 0 ? agentResult.citations : undefined,
      retrievedSources:
        agentResult.retrievedCitations.length > 0 ? agentResult.retrievedCitations : undefined,
      agentTrace: agentResult.agentTrace.length > 0 ? agentResult.agentTrace : undefined,
      stopReason: agentResult.stopReason,
    });
    structuredRagMetrics.recordChatCompletion({
      conversationId,
      userId,
      knowledgeBaseId: ctx.knowledgeBaseId,
      provider: provider.name,
      transport: 'streaming',
      orchestration: 'agent',
      stopReason: agentResult.stopReason,
      hasKnowledgeBase: !!ctx.knowledgeBaseId,
      structuredToolsAvailable: tools.some((tool) => tool.definition.name === 'outline_search'),
      retrievedCitationCount: agentResult.retrievedCitations.length,
      finalCitationCount: agentResult.citations.length,
    });
  },

  /**
   * Legacy streaming mode — hardcoded RAG search + LLM streaming
   */
  async executeLegacyStreamMode(ctx: StreamContext): Promise<void> {
    const { res, conversationId, content, userId, provider, genOptions, abortController } = ctx;

    let searchResults: EnrichedSearchResult[] = [];
    if (ctx.knowledgeBaseId) {
      try {
        const rawResults = await searchService.searchInKnowledgeBase({
          userId,
          knowledgeBaseId: ctx.knowledgeBaseId,
          query: content,
          limit: ragConfig.searchDefaultLimit,
          scoreThreshold: ragConfig.searchDefaultScoreThreshold,
          documentIds: ctx.documentIds,
        });
        searchResults = await enrichSearchResults(rawResults);
      } catch (error) {
        logger.warn({ error, conversationId }, 'RAG search failed, continuing without context');
      }
    }

    if (searchResults.length > 0) {
      const citations = promptService.toCitations(searchResults);
      sendSSE(res, { type: 'sources', data: citations });
    }

    const history = await messageService.getRecentForContext(conversationId, 10);
    const truncatedHistory = promptService.truncateHistory(history, 4000);
    const systemPrompt = promptService.buildSystemPrompt(searchResults);
    const messages = promptService.buildChatMessages(systemPrompt, truncatedHistory, content);

    let fullContent = '';
    try {
      for await (const chunk of provider.streamGenerate(messages, {
        ...genOptions,
        signal: abortController.signal,
      })) {
        if (ctx.isDisconnected()) break;
        fullContent += chunk;
        sendSSE(res, { type: 'chunk', data: chunk });
      }
    } catch (error) {
      if (ctx.isDisconnected() || (error instanceof Error && error.name === 'AbortError')) {
        logger.info({ conversationId }, 'LLM stream aborted due to client disconnect');
        return;
      }
      logger.error({ err: error, conversationId }, 'LLM streaming error');
      const fallbackContent = fullContent.trim() ? fullContent : PROVIDER_ERROR_FALLBACK_CONTENT;
      if (!fullContent.trim()) {
        sendChunkedSSE(res, fallbackContent);
      }
      const citations =
        searchResults.length > 0 ? promptService.toCitations(searchResults) : undefined;
      await persistAssistantMessage({
        messageId: ctx.assistantMessageId,
        conversationId,
        content: fallbackContent,
        citations,
        stopReason: 'provider_error',
      });
      ctx.completionStopReason = 'provider_error';
      structuredRagMetrics.recordChatCompletion({
        conversationId,
        userId,
        knowledgeBaseId: ctx.knowledgeBaseId,
        provider: provider.name,
        transport: 'streaming',
        orchestration: 'legacy',
        stopReason: 'provider_error',
        hasKnowledgeBase: !!ctx.knowledgeBaseId,
        structuredToolsAvailable: false,
        retrievedCitationCount: citations?.length ?? 0,
        finalCitationCount: citations?.length ?? 0,
      });
      return;
    }

    if (ctx.isDisconnected()) return;

    if (!fullContent.trim()) {
      logger.warn({ conversationId, userId }, 'LLM stream completed with empty content');
      sendSSE(res, {
        type: 'error',
        data: {
          code: CHAT_ERROR_CODES.STREAMING_FAILED,
          message: 'The model returned an empty response. Please try again.',
        },
      });
      res.end();
      return;
    }

    const citations =
      searchResults.length > 0 ? promptService.toCitations(searchResults) : undefined;
    await persistAssistantMessage({
      messageId: ctx.assistantMessageId,
      conversationId,
      content: fullContent,
      citations,
      stopReason: 'answered',
    });
    ctx.completionStopReason = 'answered';
    structuredRagMetrics.recordChatCompletion({
      conversationId,
      userId,
      knowledgeBaseId: ctx.knowledgeBaseId,
      provider: provider.name,
      transport: 'streaming',
      orchestration: 'legacy',
      stopReason: 'answered',
      hasKnowledgeBase: !!ctx.knowledgeBaseId,
      structuredToolsAvailable: false,
      retrievedCitationCount: citations?.length ?? 0,
      finalCitationCount: citations?.length ?? 0,
    });
  },

  /**
   * Send a message and return complete response (non-streaming)
   */
  async sendMessage(options: SendMessageOptions): Promise<{
    messageId: string;
    content: string;
    citations?: Citation[];
  }> {
    const { userId, conversationId, content, documentIds } = options;

    const conversation = await conversationService.validateOwnership(userId, conversationId);

    await messageService.create({ conversationId, role: 'user', content });

    const messageCount = await messageService.count(conversationId);
    if (messageCount === 1) {
      const title = conversationService.generateTitle(content);
      await conversationRepository.update(conversationId, { title, updatedBy: userId });
    }

    const toolContext = {
      userId,
      conversationId,
      knowledgeBaseId: conversation.knowledgeBaseId,
      documentIds,
    };
    const tools = resolveTools(toolContext);
    const provider = await llmService.getProviderForUser(userId);
    const genOptions = await llmService.getOptionsForUser(userId);

    const useAgentMode = tools.length > 0 && !!provider.generateWithTools;
    if (useAgentMode) {
      const agentResult = await executeAgentConversation(
        {
          conversationId,
          content,
          userId,
          documentIds,
          knowledgeBaseId: conversation.knowledgeBaseId,
          provider,
          genOptions,
        },
        tools
      );

      const assistantMessage = await messageService.create({
        conversationId,
        role: 'assistant',
        content: agentResult.content,
        metadata: buildCitationMetadata(
          agentResult.citations.length > 0 ? agentResult.citations : undefined,
          {
            retrievedSources:
              agentResult.retrievedCitations.length > 0
                ? agentResult.retrievedCitations
                : undefined,
            agentTrace: agentResult.agentTrace.length > 0 ? agentResult.agentTrace : undefined,
            stopReason: agentResult.stopReason,
          }
        ),
      });
      structuredRagMetrics.recordChatCompletion({
        conversationId,
        userId,
        knowledgeBaseId: conversation.knowledgeBaseId,
        provider: provider.name,
        transport: 'non_streaming',
        orchestration: 'agent',
        stopReason: agentResult.stopReason,
        hasKnowledgeBase: !!conversation.knowledgeBaseId,
        structuredToolsAvailable: tools.some((tool) => tool.definition.name === 'outline_search'),
        retrievedCitationCount: agentResult.retrievedCitations.length,
        finalCitationCount: agentResult.citations.length,
      });

      await conversationRepository.touch(conversationId, userId);

      return {
        messageId: assistantMessage.id,
        content: agentResult.content,
        citations: agentResult.citations,
      };
    }

    let searchResults: EnrichedSearchResult[] = [];
    if (conversation.knowledgeBaseId) {
      try {
        const rawResults = await searchService.searchInKnowledgeBase({
          userId,
          knowledgeBaseId: conversation.knowledgeBaseId,
          query: content,
          limit: 5,
          scoreThreshold: 0.5,
          documentIds,
        });
        searchResults = await enrichSearchResults(rawResults);
      } catch (error) {
        logger.warn({ error, conversationId }, 'RAG search failed, continuing without context');
      }
    }

    const history = await messageService.getRecentForContext(conversationId, 10);
    const truncatedHistory = promptService.truncateHistory(history, 4000);
    const systemPrompt = promptService.buildSystemPrompt(searchResults);
    const messages = promptService.buildChatMessages(systemPrompt, truncatedHistory, content);
    let responseContent: string;
    let stopReason: MessageMetadata['stopReason'] = 'answered';
    try {
      responseContent = await provider.generate(messages, genOptions);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;

      logger.error({ err: error, conversationId }, 'Non-streaming provider generate failed');
      responseContent = PROVIDER_ERROR_FALLBACK_CONTENT;
      stopReason = 'provider_error';
    }

    const citations =
      searchResults.length > 0 ? promptService.toCitations(searchResults) : undefined;
    const assistantMessage = await messageService.create({
      conversationId,
      role: 'assistant',
      content: responseContent,
      metadata: buildCitationMetadata(citations, { stopReason }),
    });
    structuredRagMetrics.recordChatCompletion({
      conversationId,
      userId,
      knowledgeBaseId: conversation.knowledgeBaseId,
      provider: provider.name,
      transport: 'non_streaming',
      orchestration: 'legacy',
      stopReason,
      hasKnowledgeBase: !!conversation.knowledgeBaseId,
      structuredToolsAvailable: false,
      retrievedCitationCount: citations?.length ?? 0,
      finalCitationCount: citations?.length ?? 0,
    });

    await conversationRepository.touch(conversationId, userId);

    return {
      messageId: assistantMessage.id,
      content: responseContent,
      citations,
    };
  },
};
