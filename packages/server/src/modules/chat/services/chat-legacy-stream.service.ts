import { CHAT_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { ragConfig } from '@config/env';
import { searchService } from '@modules/rag';
import { structuredRagMetrics } from '@core/observability';
import { createLogger } from '@core/logger';
import { messageService } from './message.service';
import { promptService } from './prompt.service';
import {
  enrichSearchResults,
  persistAssistantMessage,
  PROVIDER_ERROR_FALLBACK_CONTENT,
  sendChunkedSSE,
  sendSSE,
} from './chat.helpers';
import type { EnrichedSearchResult, StreamContext } from './chat.types';

const logger = createLogger('chat.service');

export async function executeLegacyStreamMode(ctx: StreamContext): Promise<void> {
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

  const citations = searchResults.length > 0 ? promptService.toCitations(searchResults) : undefined;
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
}
