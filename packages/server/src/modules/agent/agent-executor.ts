import type { LLMProvider, ChatMessage, GenerateOptions, AgentMessage } from '@modules/llm';
import type { AgentTool, ToolContext } from './tools';
import type {
  ToolCallInfo,
  ToolResultInfo,
  AgentStep,
  Citation,
} from '@knowledge-agent/shared/types';
import { AGENT_ERROR_CODES } from '@knowledge-agent/shared/constants';
import { agentConfig } from '@shared/config/env';
import { createLogger } from '@shared/logger';

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
  agentTrace: AgentStep[];
}

export async function executeAgentLoop(
  options: AgentExecutorOptions
): Promise<AgentExecutorResult> {
  const { provider, messages, tools, toolContext, genOptions, onToolStart, onToolEnd } = options;
  const maxIterations = options.maxIterations ?? agentConfig.maxIterations;

  // If provider doesn't support tool calls, fallback to plain generate
  if (!provider.generateWithTools) {
    logger.debug(
      { provider: provider.name },
      'Provider does not support tools, falling back to plain generate'
    );
    const content = await provider.generate(messages, genOptions);
    return { content, citations: [], agentTrace: [] };
  }

  const toolMap = new Map(tools.map((t) => [t.definition.name, t]));
  const toolDefinitions = tools.map((t) => t.definition);
  const agentMessages: AgentMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const agentTrace: AgentStep[] = [];
  const allCitations: Citation[] = [];

  for (let step = 0; step < maxIterations; step++) {
    if (toolContext.signal?.aborted) {
      logger.info('Agent loop aborted by client');
      break;
    }

    const result = await provider.generateWithTools(agentMessages, {
      ...genOptions,
      tools: toolDefinitions,
    });

    if (result.finishReason === 'text') {
      return {
        content: result.content ?? '',
        citations: allCitations,
        agentTrace,
      };
    }

    // Handle tool calls
    const toolCalls = result.toolCalls ?? [];
    if (toolCalls.length === 0) {
      return {
        content: result.content ?? '',
        citations: allCitations,
        agentTrace,
      };
    }

    onToolStart?.(step, toolCalls);
    const startTime = Date.now();

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
          const execResult = await tool.execute(tc.arguments, toolContext);
          if (execResult.citations?.length) {
            allCitations.push(...execResult.citations);
          }
          return {
            toolCallId: tc.id,
            name: tc.name,
            content: execResult.content,
          };
        } catch (error) {
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

    logger.debug({ step, toolCount: toolCalls.length, durationMs }, 'Agent step completed');
  }

  // Exceeded max iterations — do a final call without tools
  logger.warn(
    { maxIterations, code: AGENT_ERROR_CODES.MAX_ITERATIONS_EXCEEDED },
    'Agent loop exceeded max iterations, generating final answer without tools'
  );

  const plainMessages: ChatMessage[] = agentMessages.map((m) => ({
    role: m.role === 'tool' ? 'user' : m.role,
    content: m.content,
  }));
  const finalContent = await provider.generate(plainMessages, genOptions);

  return {
    content: finalContent,
    citations: allCitations,
    agentTrace,
  };
}
