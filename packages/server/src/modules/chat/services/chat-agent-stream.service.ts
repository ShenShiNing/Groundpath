import { CHAT_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { resolveTools, executeAgentLoop } from '@modules/agent';
import { toPlainChatMessages } from '@modules/agent/agent-executor.runtime';
import { agentConfig } from '@core/config/env';
import { structuredRagMetrics } from '@core/observability';
import { createLogger } from '@core/logger';
import { messageService } from './message.service';
import { promptService } from './prompt.service';
import {
  persistAssistantMessage,
  PROVIDER_ERROR_FALLBACK_CONTENT,
  sendChunkedSSE,
  sendSSE,
} from './chat.helpers';
import type { AgentExecutionCallbacks, AgentExecutionContext, StreamContext } from './chat.types';

const logger = createLogger('chat.service');

export async function executeAgentConversation(
  ctx: AgentExecutionContext,
  tools: ReturnType<typeof resolveTools>,
  callbacks?: AgentExecutionCallbacks
) {
  const {
    conversationId,
    content,
    userId,
    provider,
    genOptions,
    knowledgeBaseId,
    documentIds,
    signal,
  } = ctx;
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
  const requestSignal = signal ?? genOptions.signal;

  return executeAgentLoop({
    provider,
    messages,
    tools,
    toolContext: {
      userId,
      conversationId,
      knowledgeBaseId: knowledgeBaseId ?? undefined,
      documentIds,
      signal: requestSignal,
      runtimeState: {},
    },
    genOptions: requestSignal ? { ...genOptions, signal: requestSignal } : genOptions,
    onToolStart: callbacks?.onToolStart,
    onToolEnd: callbacks?.onToolEnd,
  });
}

export async function executeAgentMode(
  ctx: StreamContext,
  tools: ReturnType<typeof resolveTools>
): Promise<void> {
  const { res, conversationId, content, userId, provider, genOptions, abortController } = ctx;
  const heartbeatInterval =
    agentConfig.sseHeartbeatIntervalMs > 0
      ? setInterval(() => {
          if (!ctx.isDisconnected()) {
            res.write(': heartbeat\n\n');
          }
        }, agentConfig.sseHeartbeatIntervalMs)
      : undefined;

  try {
    const agentResult = await executeAgentConversation(
      {
        conversationId,
        content,
        userId,
        documentIds: ctx.documentIds,
        knowledgeBaseId: ctx.knowledgeBaseId,
        provider,
        genOptions: { ...genOptions, signal: abortController.signal },
        signal: abortController.signal,
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

    let streamedContent = '';
    let thinkingContent = '';
    try {
      if (agentResult.agentMessages) {
        for await (const chunk of provider.streamGenerate(
          toPlainChatMessages(agentResult.agentMessages),
          {
            ...genOptions,
            signal: abortController.signal,
          }
        )) {
          if (ctx.isDisconnected()) break;
          if (chunk.type === 'reasoning') {
            thinkingContent += chunk.text;
            sendSSE(res, { type: 'thinking', data: chunk.text });
          } else {
            streamedContent += chunk.text;
            sendSSE(res, { type: 'chunk', data: chunk.text });
          }
        }
        agentResult.content = streamedContent;
      }
    } catch (error) {
      if (ctx.isDisconnected() || (error instanceof Error && error.name === 'AbortError')) {
        logger.info({ conversationId }, 'Agent final stream aborted due to client disconnect');
        return;
      }

      logger.error({ err: error, conversationId }, 'Agent final streaming error');
      const fallbackContent = streamedContent.trim()
        ? streamedContent
        : agentResult.content.trim()
          ? agentResult.content
          : PROVIDER_ERROR_FALLBACK_CONTENT;

      if (!streamedContent.trim()) {
        sendChunkedSSE(res, fallbackContent);
      }

      await persistAssistantMessage({
        messageId: ctx.assistantMessageId,
        conversationId,
        content: fallbackContent,
        citations: agentResult.citations.length > 0 ? agentResult.citations : undefined,
        retrievedSources:
          agentResult.retrievedCitations.length > 0 ? agentResult.retrievedCitations : undefined,
        thinkingContent: thinkingContent || undefined,
        agentTrace: agentResult.agentTrace.length > 0 ? agentResult.agentTrace : undefined,
        stopReason: 'provider_error',
      });
      ctx.completionStopReason = 'provider_error';
      structuredRagMetrics.recordChatCompletion({
        conversationId,
        userId,
        knowledgeBaseId: ctx.knowledgeBaseId,
        provider: provider.name,
        transport: 'streaming',
        orchestration: 'agent',
        stopReason: 'provider_error',
        hasKnowledgeBase: !!ctx.knowledgeBaseId,
        structuredToolsAvailable: tools.some((tool) => tool.definition.name === 'outline_search'),
        retrievedCitationCount: agentResult.retrievedCitations.length,
        finalCitationCount: agentResult.citations.length,
      });
      return;
    }

    if (ctx.isDisconnected()) return;

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

    if (!agentResult.agentMessages && agentResult.content) {
      sendChunkedSSE(res, agentResult.content);
    }

    await persistAssistantMessage({
      messageId: ctx.assistantMessageId,
      conversationId,
      content: agentResult.content,
      citations: agentResult.citations.length > 0 ? agentResult.citations : undefined,
      retrievedSources:
        agentResult.retrievedCitations.length > 0 ? agentResult.retrievedCitations : undefined,
      thinkingContent: thinkingContent || undefined,
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
  } finally {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
  }
}
