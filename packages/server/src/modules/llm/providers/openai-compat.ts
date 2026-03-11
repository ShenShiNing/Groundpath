import type {
  AgentMessage,
  GenerateWithToolsOptions,
  ToolGenerateResult,
} from './llm-provider.interface';
import type { ToolCallInfo } from '@knowledge-agent/shared/types';
import { Errors } from '@shared/errors';

// --- OpenAI-compatible tool calling types ---

interface OpenAICompatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAICompatResponse {
  choices: Array<{
    message: {
      content?: string | null;
      tool_calls?: OpenAICompatToolCall[];
    };
    finish_reason: string;
  }>;
}

// --- OpenAI-compatible message format ---

type OpenAICompatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAICompatToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/**
 * Convert AgentMessage[] to OpenAI-compatible message format (used by raw-fetch providers).
 */
export function agentMessagesToOpenAICompat(messages: AgentMessage[]): OpenAICompatMessage[] {
  return messages.map((msg) => {
    if (msg.role === 'tool') {
      return { role: 'tool' as const, tool_call_id: msg.toolCallId, content: msg.content };
    }
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return {
        role: 'assistant' as const,
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: msg.role, content: msg.content };
  });
}

/**
 * Generate a tool-calling response via an OpenAI-compatible chat/completions endpoint.
 */
export async function openaiCompatGenerateWithTools(
  url: string,
  apiKey: string,
  model: string,
  messages: AgentMessage[],
  options: GenerateWithToolsOptions
): Promise<ToolGenerateResult> {
  const body: Record<string, unknown> = {
    model,
    messages: agentMessagesToOpenAICompat(messages),
    tools: options.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })),
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    top_p: options.topP,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw Errors.external(`API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as OpenAICompatResponse;
  const choice = data.choices[0];
  if (!choice) {
    return { finishReason: 'text', content: '' };
  }

  if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
    const toolCalls: ToolCallInfo[] = choice.message.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: safeParseFunctionArgs(tc.function.arguments),
    }));
    return {
      finishReason: 'tool_calls',
      content: choice.message.content ?? undefined,
      toolCalls,
    };
  }

  return { finishReason: 'text', content: choice.message.content ?? '' };
}

function safeParseFunctionArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { _raw: raw };
  }
}
