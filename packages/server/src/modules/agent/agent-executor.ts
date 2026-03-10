import type { LLMProvider, ChatMessage, GenerateOptions, AgentMessage } from '@modules/llm';
import type { AgentTool, ToolContext, ToolExecutionResult } from './tools';
import type {
  ToolCallInfo,
  ToolResultInfo,
  AgentStep,
  AgentStopReason,
  Citation,
} from '@knowledge-agent/shared/types';
import { AGENT_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { agentConfig } from '@shared/config/env';
import { createLogger } from '@shared/logger';
import { structuredRagMetrics } from '@shared/observability';

const logger = createLogger('agent-executor');

export interface AgentExecutorOptions {
  provider: LLMProvider;
  messages: ChatMessage[];
  tools: AgentTool[];
  toolContext: ToolContext;
  genOptions: GenerateOptions;
  maxIterations?: number;
  onToolStart?: (stepIndex: number, toolCalls: ToolCallInfo[]) => void;
  onToolEnd?: (stepIndex: number, results: ToolResultInfo[], durationMs: number) => void;
}

export interface AgentExecutorResult {
  content: string;
  citations: Citation[];
  retrievedCitations: Citation[];
  agentTrace: AgentStep[];
  stopReason?: AgentStopReason;
}

const PROVIDER_ERROR_FALLBACK_CONTENT =
  'The model provider failed before the answer could be completed. Please try again.';

class AgentToolTimeoutError extends Error {
  readonly toolName: string;
  readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(`Tool "${toolName}" timed out after ${timeoutMs}ms`);
    this.name = 'AgentToolTimeoutError';
    this.toolName = toolName;
    this.timeoutMs = timeoutMs;
  }
}

function getCitationKey(citation: Citation): string {
  if (citation.sourceType === 'node') {
    return `node:${citation.documentId}:${citation.indexVersion ?? ''}:${citation.nodeId}`;
  }

  return `chunk:${citation.documentId}:${citation.documentVersion ?? ''}:${citation.chunkIndex}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([key, nested]) => `${key}:${stableStringify(nested)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function finalizeCitations(citations: Citation[], maxItems: number = 8): Citation[] {
  const deduped = new Map<string, Citation>();

  for (const citation of citations) {
    const key = getCitationKey(citation);
    const previous = deduped.get(key);
    if (!previous || (citation.score ?? 0) > (previous.score ?? 0)) {
      deduped.set(key, citation);
    }
  }

  return [...deduped.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, maxItems);
}

function hasKnowledgeTool(tools: AgentTool[]): boolean {
  return tools.some(
    (tool) => tool.definition.category === 'structured' || tool.definition.category === 'fallback'
  );
}

function finalizeStopReason(input: {
  stopReason: AgentStopReason;
  tools: AgentTool[];
  finalCitations: Citation[];
  agentTrace: AgentStep[];
}): AgentStopReason {
  if (input.stopReason !== 'answered') return input.stopReason;

  if (
    hasKnowledgeTool(input.tools) &&
    input.agentTrace.length > 0 &&
    input.finalCitations.length === 0
  ) {
    return 'insufficient_evidence';
  }

  return input.stopReason;
}

function buildResult(input: {
  content: string;
  stopReason: AgentStopReason;
  citations: Citation[];
  agentTrace: AgentStep[];
  tools: AgentTool[];
}): AgentExecutorResult {
  const finalCitations = finalizeCitations(input.citations);

  return {
    content: input.content,
    citations: finalCitations,
    retrievedCitations: input.citations,
    agentTrace: input.agentTrace,
    stopReason: finalizeStopReason({
      stopReason: input.stopReason,
      tools: input.tools,
      finalCitations,
      agentTrace: input.agentTrace,
    }),
  };
}

async function generateWithoutTools(input: {
  provider: LLMProvider;
  agentMessages: AgentMessage[];
  genOptions: GenerateOptions;
  stopReason: AgentStopReason;
  citations: Citation[];
  agentTrace: AgentStep[];
  tools: AgentTool[];
}): Promise<AgentExecutorResult> {
  const plainMessages: ChatMessage[] = input.agentMessages.map((m) => ({
    role: m.role === 'tool' ? 'user' : m.role,
    content: m.content,
  }));

  try {
    const finalContent = await input.provider.generate(plainMessages, input.genOptions);
    return buildResult({
      content: finalContent,
      stopReason: input.stopReason,
      citations: input.citations,
      agentTrace: input.agentTrace,
      tools: input.tools,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;

    logger.error({ err: error, stopReason: input.stopReason }, 'Plain generate fallback failed');
    return buildResult({
      content: PROVIDER_ERROR_FALLBACK_CONTENT,
      stopReason: 'provider_error',
      citations: input.citations,
      agentTrace: input.agentTrace,
      tools: input.tools,
    });
  }
}

async function withToolTimeout<T>(promise: Promise<T>, toolName: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new AgentToolTimeoutError(toolName, agentConfig.toolTimeout));
        }, agentConfig.toolTimeout);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export async function executeAgentLoop(
  options: AgentExecutorOptions
): Promise<AgentExecutorResult> {
  const { provider, messages, tools, toolContext, genOptions, onToolStart, onToolEnd } = options;
  const maxIterations = options.maxIterations ?? agentConfig.maxIterations;
  const executionStartedAt = Date.now();
  const agentTrace: AgentStep[] = [];
  const allCitations: Citation[] = [];
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

  // If provider doesn't support tool calls, fallback to plain generate
  if (!provider.generateWithTools) {
    logger.debug(
      { provider: provider.name },
      'Provider does not support tools, falling back to plain generate'
    );
    try {
      const content = await provider.generate(messages, genOptions);
      return finalizeExecutionResult(
        buildResult({
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
        buildResult({
          content: PROVIDER_ERROR_FALLBACK_CONTENT,
          stopReason: 'provider_error',
          citations: [],
          agentTrace: [],
          tools,
        })
      );
    }
  }

  const toolMap = new Map(tools.map((t) => [t.definition.name, t]));
  const toolDefinitions = tools.map((t) => t.definition);
  const agentMessages: AgentMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));

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
      // Re-throw AbortErrors as-is so callers can distinguish client disconnects
      if (error instanceof Error && error.name === 'AbortError') throw error;

      logger.error(
        { err: error, step, provider: provider.name, messageCount: agentMessages.length },
        'LLM generateWithTools call failed'
      );
      return finalizeExecutionResult(
        buildResult({
          content: PROVIDER_ERROR_FALLBACK_CONTENT,
          stopReason: 'provider_error',
          citations: allCitations,
          agentTrace,
          tools,
        })
      );
    }

    if (result.finishReason === 'text') {
      return finalizeExecutionResult(
        buildResult({
          content: result.content ?? '',
          citations: allCitations,
          agentTrace,
          stopReason: 'answered',
          tools,
        })
      );
    }

    // Handle tool calls
    const toolCalls = result.toolCalls ?? [];
    if (toolCalls.length === 0) {
      return finalizeExecutionResult(
        buildResult({
          content: result.content ?? '',
          citations: allCitations,
          agentTrace,
          stopReason: 'answered',
          tools,
        })
      );
    }

    const toolCategories = toolCalls.map(
      (toolCall) => toolMap.get(toolCall.name)?.definition.category
    );
    const structuredToolCalls = toolCategories.filter(
      (category) => category === 'structured'
    ).length;
    const fallbackToolCalls = toolCategories.filter((category) => category === 'fallback').length;
    const externalToolCalls = toolCategories.filter((category) => category === 'external').length;

    if (
      structuredRounds + structuredToolCalls > agentConfig.maxStructuredRounds ||
      fallbackRounds + fallbackToolCalls > agentConfig.maxFallbackRounds
    ) {
      logger.warn(
        {
          step,
          structuredRounds,
          fallbackRounds,
          nextStructuredToolCalls: structuredToolCalls,
          nextFallbackToolCalls: fallbackToolCalls,
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
    const startTime = Date.now();
    let sawToolTimeout = false;

    // Add assistant message with tool calls to conversation
    agentMessages.push({
      role: 'assistant',
      content: result.content ?? '',
      toolCalls,
    });

    // Execute tools concurrently
    const toolResults: ToolResultInfo[] = await Promise.all(
      toolCalls.map(async (tc) => {
        const tool = toolMap.get(tc.name);
        if (!tool) {
          logger.warn({ toolName: tc.name }, 'Tool not found');
          return {
            toolCallId: tc.id,
            name: tc.name,
            content: `Error: tool "${tc.name}" not found.`,
            isError: true,
          };
        }

        try {
          if (toolContext.runtimeState && !toolContext.runtimeState.toolResultCache) {
            toolContext.runtimeState.toolResultCache = {};
          }
          const runtimeCache = toolContext.runtimeState?.toolResultCache;
          const cacheKey = `${tc.name}:${stableStringify(tc.arguments)}`;
          let execResult: ToolExecutionResult;

          if (runtimeCache?.[cacheKey]) {
            execResult = runtimeCache[cacheKey]!;
          } else {
            execResult = await withToolTimeout(tool.execute(tc.arguments, toolContext), tc.name);
            if (runtimeCache) {
              runtimeCache[cacheKey] = execResult;
            }
          }
          if (execResult.citations?.length) {
            allCitations.push(...execResult.citations);
          }
          return {
            toolCallId: tc.id,
            name: tc.name,
            content: execResult.content,
          };
        } catch (error) {
          if (error instanceof AgentToolTimeoutError) {
            sawToolTimeout = true;
            logger.warn(
              { toolName: tc.name, timeoutMs: error.timeoutMs },
              'Tool execution timed out'
            );
            return {
              toolCallId: tc.id,
              name: tc.name,
              content: error.message,
              isError: true,
              isTimeout: true,
            };
          }

          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.warn({ toolName: tc.name, error: errorMsg }, 'Tool execution failed');
          return {
            toolCallId: tc.id,
            name: tc.name,
            content: `Error executing tool: ${errorMsg}`,
            isError: true,
          };
        }
      })
    );

    const durationMs = Date.now() - startTime;

    // Add tool results to conversation
    for (const tr of toolResults) {
      agentMessages.push({
        role: 'tool',
        content: tr.content,
        toolCallId: tr.toolCallId,
      });
    }

    agentTrace.push({ toolCalls, toolResults, durationMs });
    onToolEnd?.(step, toolResults, durationMs);
    structuredRounds += structuredToolCalls;
    fallbackRounds += fallbackToolCalls;
    externalRounds += externalToolCalls;
    totalToolCalls += toolCalls.length;

    if (sawToolTimeout) {
      logger.warn({ step, durationMs }, 'Agent stopping after tool timeout');
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

    logger.debug({ step, toolCount: toolCalls.length, durationMs }, 'Agent step completed');
  }

  // Exceeded max iterations — do a final call without tools
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
