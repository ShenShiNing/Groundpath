import OpenAI from 'openai';
import type {
  LLMProvider,
  ChatMessage,
  GenerateOptions,
  AgentMessage,
  GenerateWithToolsOptions,
  ToolGenerateResult,
} from './llm-provider.interface';
import type { LLMProviderType, ToolCallInfo } from '@knowledge-agent/shared/types';
import { Errors } from '@core/errors';
import { logger } from '@core/logger';

export class OpenAIProvider implements LLMProvider {
  readonly name: LLMProviderType = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
      },
      { signal: options?.signal }
    );

    return response.choices[0]?.message?.content ?? '';
  }

  async *streamGenerate(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<string, void, unknown> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        stream: true,
      },
      { signal: options?.signal }
    );

    for await (const chunk of stream) {
      // Check if aborted before yielding
      if (options?.signal?.aborted) {
        return;
      }
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  async generateWithTools(
    messages: AgentMessage[],
    options: GenerateWithToolsOptions
  ): Promise<ToolGenerateResult> {
    const openaiMessages = agentMessagesToOpenAI(messages);
    const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = options.tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: openaiMessages,
        tools: openaiTools,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        top_p: options.topP,
      },
      { signal: options.signal }
    );

    const choice = response.choices[0];
    if (!choice) {
      return { finishReason: 'text', content: '' };
    }

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
      const toolCalls: ToolCallInfo[] = choice.message.tool_calls
        .filter(
          (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
            tc.type === 'function'
        )
        .map((tc) => ({
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

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      });
      // Reaching provider API without exception means credentials/model are usable.
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ errorMessage, provider: 'openai' }, 'Health check failed');
      throw Errors.external(errorMessage);
    }
  }
}

function safeParseFunctionArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { _raw: raw };
  }
}

function agentMessagesToOpenAI(
  messages: AgentMessage[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    if (msg.role === 'tool') {
      return {
        role: 'tool' as const,
        tool_call_id: msg.toolCallId,
        content: msg.content,
      };
    }
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return {
        role: 'assistant' as const,
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }
    return { role: msg.role, content: msg.content };
  });
}
