import type { AgentMessage } from '@modules/llm';
import { AGENT_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { agentConfig } from '@core/config/env';
import { createLogger } from '@core/logger';
import { structuredRagMetrics } from '@core/observability';
import { buildAgentExecutorResult } from './agent-executor.citations';
import {
  appendToolResultsToMessages,
  executeToolCalls,
  generateWithoutTools,
  getToolCategoryCounts,
  PROVIDER_ERROR_FALLBACK_CONTENT,
} from './agent-executor.runtime';
import type {
  AgentExecutorOptions,
  AgentExecutorResult,
  TaggedCitation,
} from './agent-executor.types';

const logger = createLogger('agent-executor');

export type { AgentExecutorOptions, AgentExecutorResult } from './agent-executor.types';

export async function executeAgentLoop(
  options: AgentExecutorOptions
): Promise<AgentExecutorResult> {
  const { provider, messages, tools, toolContext, genOptions, onToolStart, onToolEnd } = options;
  const maxIterations = options.maxIterations ?? agentConfig.maxIterations;
  const executionStartedAt = Date.now();
  const agentTrace: AgentExecutorResult['agentTrace'] = [];
  const allCitations: TaggedCitation[] = [];
  let structuredRounds = 0;
  let fallbackRounds = 0;
  let externalRounds = 0;
  let totalToolCalls = 0;

  function finalizeExecutionResult(result: AgentExecutorResult): AgentExecutorResult {
    structuredRagMetrics.recordAgentExecution({
      conversationId: toolContext.conversationId,
      userId: toolContext.userId,
      knowledgeBaseId: toolContext.knowledgeBaseId,
      provider: provider.name,
      stopReason: result.stopReason,
      durationMs: Date.now() - executionStartedAt,
      toolCallCount: totalToolCalls,
      structuredToolCalls: structuredRounds,
      fallbackToolCalls: fallbackRounds,
      externalToolCalls: externalRounds,
      agentTraceSteps: agentTrace.length,
      retrievedCitationCount: result.retrievedCitations.length,
      finalCitationCount: result.citations.length,
    });

    return result;
  }

  if (!provider.generateWithTools) {
    logger.debug(
      { provider: provider.name },
      'Provider does not support tools, falling back to plain generate'
    );
    try {
      const content = await provider.generate(messages, genOptions);
      return finalizeExecutionResult(
        buildAgentExecutorResult({
          content,
          stopReason: 'answered',
          citations: [],
          agentTrace: [],
          tools,
        })
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;

      logger.error({ err: error, provider: provider.name }, 'Provider generate call failed');
      return finalizeExecutionResult(
        buildAgentExecutorResult({
          content: PROVIDER_ERROR_FALLBACK_CONTENT,
          stopReason: 'provider_error',
          citations: [],
          agentTrace: [],
          tools,
        })
      );
    }
  }

  const toolMap = new Map(tools.map((tool) => [tool.definition.name, tool]));
  const toolDefinitions = tools.map((tool) => tool.definition);
  const agentMessages: AgentMessage[] = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  for (let step = 0; step < maxIterations; step++) {
    if (toolContext.signal?.aborted) {
      logger.info('Agent loop aborted by client');
      break;
    }

    let result;
    try {
      result = await provider.generateWithTools(agentMessages, {
        ...genOptions,
        tools: toolDefinitions,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;

      logger.error(
        { err: error, step, provider: provider.name, messageCount: agentMessages.length },
        'LLM generateWithTools call failed'
      );
      return finalizeExecutionResult(
        buildAgentExecutorResult({
          content: PROVIDER_ERROR_FALLBACK_CONTENT,
          stopReason: 'provider_error',
          citations: allCitations,
          agentTrace,
          tools,
        })
      );
    }

    if (result.finishReason === 'text' || (result.toolCalls ?? []).length === 0) {
      return finalizeExecutionResult(
        buildAgentExecutorResult({
          content: result.content ?? '',
          citations: allCitations,
          agentTrace,
          stopReason: 'answered',
          tools,
        })
      );
    }

    const toolCalls = result.toolCalls ?? [];
    const toolCategoryCounts = getToolCategoryCounts(toolCalls, toolMap);

    if (
      structuredRounds + toolCategoryCounts.structured > agentConfig.maxStructuredRounds ||
      fallbackRounds + toolCategoryCounts.fallback > agentConfig.maxFallbackRounds
    ) {
      logger.warn(
        {
          step,
          structuredRounds,
          fallbackRounds,
          nextStructuredToolCalls: toolCategoryCounts.structured,
          nextFallbackToolCalls: toolCategoryCounts.fallback,
        },
        'Agent tool budget exhausted before executing tool calls'
      );
      return finalizeExecutionResult(
        await generateWithoutTools({
          provider,
          agentMessages,
          genOptions,
          stopReason: 'budget_exhausted',
          citations: allCitations,
          agentTrace,
          tools,
        })
      );
    }

    onToolStart?.(step, toolCalls);

    agentMessages.push({
      role: 'assistant',
      content: result.content ?? '',
      toolCalls,
    });

    const toolExecution = await executeToolCalls({
      toolCalls,
      toolMap,
      toolContext,
    });
    allCitations.push(...toolExecution.citations);
    appendToolResultsToMessages(agentMessages, toolExecution.toolResults);

    agentTrace.push({
      toolCalls,
      toolResults: toolExecution.toolResults,
      durationMs: toolExecution.durationMs,
    });
    onToolEnd?.(step, toolExecution.toolResults, toolExecution.durationMs);
    structuredRounds += toolCategoryCounts.structured;
    fallbackRounds += toolCategoryCounts.fallback;
    externalRounds += toolCategoryCounts.external;
    totalToolCalls += toolCalls.length;

    if (toolExecution.sawToolTimeout) {
      logger.warn(
        { step, durationMs: toolExecution.durationMs },
        'Agent stopping after tool timeout'
      );
      return finalizeExecutionResult(
        await generateWithoutTools({
          provider,
          agentMessages,
          genOptions,
          stopReason: 'tool_timeout',
          citations: allCitations,
          agentTrace,
          tools,
        })
      );
    }

    logger.debug(
      { step, toolCount: toolCalls.length, durationMs: toolExecution.durationMs },
      'Agent step completed'
    );
  }

  logger.warn(
    { maxIterations, code: AGENT_ERROR_CODES.MAX_ITERATIONS_EXCEEDED },
    'Agent loop exceeded max iterations, generating final answer without tools'
  );

  return finalizeExecutionResult(
    await generateWithoutTools({
      provider,
      agentMessages,
      genOptions,
      stopReason: 'budget_exhausted',
      citations: allCitations,
      agentTrace,
      tools,
    })
  );
}
