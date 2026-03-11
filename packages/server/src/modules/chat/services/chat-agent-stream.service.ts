import { CHAT_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { resolveTools, executeAgentLoop } from '@modules/agent';
import { structuredRagMetrics } from '@shared/observability';
import { createLogger } from '@shared/logger';
import { messageService } from './message.service';
import { promptService } from './prompt.service';
import { persistAssistantMessage, sendChunkedSSE, sendSSE } from './chat.helpers';
import type { AgentExecutionCallbacks, AgentExecutionContext, StreamContext } from './chat.types';

const logger = createLogger('chat.service');

export async function executeAgentConversation(
  ctx: AgentExecutionContext,
  tools: ReturnType<typeof resolveTools>,
  callbacks?: AgentExecutionCallbacks
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

export async function executeAgentMode(
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
}
