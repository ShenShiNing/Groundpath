import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Citation, MessageMetadata } from '@groundpath/shared/types';
import { resolveTools } from '@modules/agent';
import { llmService, type LLMProvider } from '@modules/llm';
import { searchService } from '@modules/rag';
import { chatConfig } from '@core/config/env/configs';
import { createLogger } from '@core/logger';
import { structuredRagMetrics } from '@core/observability';
import { conversationRepository } from '../repositories/conversation.repository';
import { executeAgentConversation, executeAgentMode } from './chat-agent-stream.service';
import { executeLegacyStreamMode } from './chat-legacy-stream.service';
import {
  buildCitationMetadata,
  enrichSearchResults,
  PROVIDER_ERROR_FALLBACK_CONTENT,
  sendSSE,
} from './chat.helpers';
import { conversationService } from './conversation.service';
import { messageService } from './message.service';
import { promptService } from './prompt.service';
import type { EnrichedSearchResult, SendMessageOptions, StreamContext } from './chat.types';

const logger = createLogger('chat.service');

const TITLE_GEN_SYSTEM_PROMPT =
  'Generate a concise conversation title (max 20 characters) based on the user message below. ' +
  'Reply with only the title text, no quotes or extra formatting. ' +
  'Use the same language as the user message.';

async function generateAITitle(provider: LLMProvider, content: string): Promise<string | null> {
  const result = await provider.generate(
    [
      { role: 'system', content: TITLE_GEN_SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    {
      maxTokens: chatConfig.titleGenMaxTokens,
      temperature: chatConfig.titleGenTemperature,
    }
  );

  let title = result
    .trim()
    .replace(/^["'"\u201C\u201D\u2018\u2019]+|["'"\u201C\u201D\u2018\u2019]+$/g, '');
  if (!title) return null;
  if (title.length > chatConfig.titleMaxLength) {
    title = title.substring(0, chatConfig.titleMaxLength - 3) + '...';
  }
  return title;
}

async function prepareChatRequest(options: SendMessageOptions) {
  const { userId, conversationId, content, documentIds, editedMessageId } = options;

  const conversation = await conversationService.validateOwnership(userId, conversationId);

  let userMessageId: string;
  if (editedMessageId) {
    await messageService.editContent(conversationId, editedMessageId, content);
    userMessageId = editedMessageId;
  } else {
    const userMessage = await messageService.create({ conversationId, role: 'user', content });
    userMessageId = userMessage.id;
  }

  const messageCount = await messageService.count(conversationId);
  const isFirstMessage = messageCount === 1;
  if (isFirstMessage) {
    const title = conversationService.generateTitle(content);
    await conversationRepository.update(conversationId, { title, updatedBy: userId });
  }

  const tools = resolveTools({
    userId,
    conversationId,
    knowledgeBaseId: conversation.knowledgeBaseId,
    documentIds,
  });
  const provider = await llmService.getProviderForUser(userId);
  const genOptions = await llmService.getOptionsForUser(userId);

  return { conversation, tools, provider, genOptions, userMessageId, isFirstMessage };
}

export const chatService = {
  async sendMessageWithSSE(res: Response, options: SendMessageOptions): Promise<void> {
    const { userId, conversationId, content, documentIds } = options;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.socket?.setTimeout(0);

    try {
      const { conversation, tools, provider, genOptions, userMessageId, isFirstMessage } =
        await prepareChatRequest(options);
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
          await executeAgentMode(ctx, tools);
        } else {
          await executeLegacyStreamMode(ctx);
        }
      } finally {
        res.off('close', onClose);
      }

      if (clientDisconnected || res.writableEnded) return;

      let generatedTitle: string | undefined;
      if (isFirstMessage) {
        try {
          const aiTitle = await generateAITitle(provider, content);
          if (aiTitle) {
            await conversationRepository.update(conversationId, {
              title: aiTitle,
              updatedBy: userId,
            });
            generatedTitle = aiTitle;
          }
        } catch (err) {
          logger.warn(
            { err, conversationId },
            'AI title generation failed, keeping fallback title'
          );
        }
      }

      await conversationRepository.touch(conversationId, userId);
      sendSSE(res, {
        type: 'done',
        data: {
          messageId: assistantMessageId,
          userMessageId,
          stopReason: ctx.completionStopReason,
          title: generatedTitle,
        },
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

  async sendMessage(options: SendMessageOptions): Promise<{
    messageId: string;
    content: string;
    citations?: Citation[];
  }> {
    const { userId, conversationId, content, documentIds } = options;
    const { conversation, tools, provider, genOptions, isFirstMessage } =
      await prepareChatRequest(options);

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

      if (isFirstMessage) {
        generateAITitle(provider, content)
          .then(async (title) => {
            if (title) {
              await conversationRepository.update(conversationId, { title, updatedBy: userId });
            }
          })
          .catch((err) => {
            logger.warn({ err, conversationId }, 'AI title generation failed');
          });
      }

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

    if (isFirstMessage) {
      generateAITitle(provider, content)
        .then(async (title) => {
          if (title) {
            await conversationRepository.update(conversationId, { title, updatedBy: userId });
          }
        })
        .catch((err) => {
          logger.warn({ err, conversationId }, 'AI title generation failed');
        });
    }

    return {
      messageId: assistantMessage.id,
      content: responseContent,
      citations,
    };
  },
};
