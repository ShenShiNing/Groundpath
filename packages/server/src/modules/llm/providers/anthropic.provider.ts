import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  ChatMessage,
  GenerateOptions,
  AgentMessage,
  GenerateWithToolsOptions,
  ToolGenerateResult,
} from './llm-provider.interface';
import type { LLMProviderType, ToolCallInfo } from '@knowledge-agent/shared/types';
import { Errors } from '@shared/errors';
import { logger } from '@shared/logger';

export class AnthropicProvider implements LLMProvider {
  readonly name: LLMProviderType = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    // Separate system message from others
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: options?.maxTokens ?? 4096,
        ...(systemMessage && { system: systemMessage.content }),
        messages: chatMessages,
        temperature: options?.temperature,
        top_p: options?.topP,
      },
      { signal: options?.signal }
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock?.text ?? '';
  }

  async *streamGenerate(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<string, void, unknown> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: options?.maxTokens ?? 4096,
        ...(systemMessage && { system: systemMessage.content }),
        messages: chatMessages,
        temperature: options?.temperature,
        top_p: options?.topP,
      },
      { signal: options?.signal }
    );

    for await (const event of stream) {
      // Check if aborted before yielding
      if (options?.signal?.aborted) {
        stream.abort();
        return;
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }

  async generateWithTools(
    messages: AgentMessage[],
    options: GenerateWithToolsOptions
  ): Promise<ToolGenerateResult> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const anthropicMessages = agentMessagesToAnthropic(messages.filter((m) => m.role !== 'system'));

    const anthropicTools: Anthropic.Messages.Tool[] = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
    }));

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: options.maxTokens ?? 4096,
        ...(systemMessage && { system: systemMessage.content }),
        messages: anthropicMessages,
        tools: anthropicTools,
        temperature: options.temperature,
        top_p: options.topP,
      },
      { signal: options.signal }
    );

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
      );
      const textBlock = response.content.find(
        (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
      );

      const toolCalls: ToolCallInfo[] = toolUseBlocks.map((b) => ({
        id: b.id,
        name: b.name,
        arguments: b.input as Record<string, unknown>,
      }));

      return {
        finishReason: 'tool_calls',
        content: textBlock?.text,
        toolCalls,
      };
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
    );
    return { finishReason: 'text', content: textBlock?.text ?? '' };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.generate([{ role: 'user', content: 'hi' }], { maxTokens: 5 });
      // Reaching provider API without exception means credentials/model are usable.
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ errorMessage, provider: 'anthropic' }, 'Health check failed');
      throw Errors.external(errorMessage);
    }
  }
}

function agentMessagesToAnthropic(messages: AgentMessage[]): Anthropic.Messages.MessageParam[] {
  const result: Anthropic.Messages.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      const content: Anthropic.Messages.ContentBlockParam[] = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
      }
      if (content.length > 0) {
        result.push({ role: 'assistant', content });
      }
    } else if (msg.role === 'tool') {
      // Anthropic tool results go in a user message with tool_result blocks
      const lastMsg = result[result.length - 1];
      const toolResultBlock: Anthropic.Messages.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: msg.toolCallId,
        content: msg.content,
      };

      if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
        // Merge into existing user message with tool_result blocks
        (lastMsg.content as Anthropic.Messages.ContentBlockParam[]).push(toolResultBlock);
      } else {
        result.push({ role: 'user', content: [toolResultBlock] });
      }
    }
  }

  return result;
}
