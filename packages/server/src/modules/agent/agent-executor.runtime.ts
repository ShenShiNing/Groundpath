import type { AgentMessage, ChatMessage } from '@modules/llm/public/runtime';
import { agentConfig } from '@core/config/env';
import { createLogger } from '@core/logger';
import type { ToolExecutionResult } from './tools';
import { buildAgentExecutorResult } from './agent-executor.citations';
import type {
  AgentExecutorResult,
  ExecuteToolCallsInput,
  ExecuteToolCallsResult,
  GenerateWithoutToolsInput,
  TaggedCitation,
  ToolCategoryCounts,
} from './agent-executor.types';

const logger = createLogger('agent-executor');

export const PROVIDER_ERROR_FALLBACK_CONTENT =
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

export async function generateWithoutTools(
  input: GenerateWithoutToolsInput
): Promise<AgentExecutorResult> {
  const plainMessages = toPlainChatMessages(input.agentMessages);

  try {
    const finalContent = await input.provider.generate(plainMessages, input.genOptions);
    return buildAgentExecutorResult({
      content: finalContent,
      stopReason: input.stopReason,
      citations: input.citations,
      agentTrace: input.agentTrace,
      tools: input.tools,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;

    logger.error({ err: error, stopReason: input.stopReason }, 'Plain generate fallback failed');
    return buildAgentExecutorResult({
      content: PROVIDER_ERROR_FALLBACK_CONTENT,
      stopReason: 'provider_error',
      citations: input.citations,
      agentTrace: input.agentTrace,
      tools: input.tools,
    });
  }
}

export function toPlainChatMessages(agentMessages: AgentMessage[]): ChatMessage[] {
  return agentMessages.map((message) => ({
    role: message.role === 'tool' ? 'user' : message.role,
    content: message.content,
  }));
}

export function getToolCategoryCounts(
  toolCalls: ExecuteToolCallsInput['toolCalls'],
  toolMap: ExecuteToolCallsInput['toolMap']
): ToolCategoryCounts {
  const categories = toolCalls.map((toolCall) => toolMap.get(toolCall.name)?.definition.category);

  return {
    structured: categories.filter((category) => category === 'structured').length,
    fallback: categories.filter((category) => category === 'fallback').length,
    external: categories.filter((category) => category === 'external').length,
  };
}

function buildToolErrorResult(input: {
  toolCallId: string;
  name: string;
  content: string;
  isTimeout?: boolean;
}) {
  return {
    toolResult: {
      toolCallId: input.toolCallId,
      name: input.name,
      content: input.content,
      isError: true,
      isTimeout: input.isTimeout,
    },
    citations: [] as TaggedCitation[],
    timedOut: !!input.isTimeout,
  };
}

export async function executeToolCalls(
  input: ExecuteToolCallsInput
): Promise<ExecuteToolCallsResult> {
  if (input.toolContext.runtimeState && !input.toolContext.runtimeState.toolResultCache) {
    input.toolContext.runtimeState.toolResultCache = {};
  }
  const runtimeCache = input.toolContext.runtimeState?.toolResultCache;
  const startedAt = Date.now();

  const executionResults = await Promise.all(
    input.toolCalls.map(async (toolCall) => {
      const tool = input.toolMap.get(toolCall.name);
      if (!tool) {
        logger.warn({ toolName: toolCall.name }, 'Tool not found');
        return buildToolErrorResult({
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: `Error: tool "${toolCall.name}" not found.`,
        });
      }

      try {
        const cacheKey = `${toolCall.name}:${stableStringify(toolCall.arguments)}`;
        let executionResult: ToolExecutionResult;

        if (runtimeCache?.[cacheKey]) {
          executionResult = runtimeCache[cacheKey]!;
        } else {
          executionResult = await withToolTimeout(
            tool.execute(toolCall.arguments, input.toolContext),
            toolCall.name
          );
          if (runtimeCache) {
            runtimeCache[cacheKey] = executionResult;
          }
        }

        return {
          toolResult: {
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: executionResult.content,
          },
          citations:
            executionResult.citations?.map((citation) => ({
              citation,
              toolName: toolCall.name,
            })) ?? [],
          timedOut: false,
        };
      } catch (error) {
        if (error instanceof AgentToolTimeoutError) {
          logger.warn(
            { toolName: toolCall.name, timeoutMs: error.timeoutMs },
            'Tool execution timed out'
          );
          return buildToolErrorResult({
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: error.message,
            isTimeout: true,
          });
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn({ toolName: toolCall.name, error: errorMessage }, 'Tool execution failed');
        return buildToolErrorResult({
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: `Error executing tool: ${errorMessage}`,
        });
      }
    })
  );

  return {
    toolResults: executionResults.map((result) => result.toolResult),
    citations: executionResults.flatMap((result) => result.citations),
    sawToolTimeout: executionResults.some((result) => result.timedOut),
    durationMs: Date.now() - startedAt,
  };
}

export function appendToolResultsToMessages(
  agentMessages: AgentMessage[],
  toolResults: ExecuteToolCallsResult['toolResults']
): void {
  for (const toolResult of toolResults) {
    agentMessages.push({
      role: 'tool',
      content: toolResult.content,
      toolCallId: toolResult.toolCallId,
    });
  }
}
