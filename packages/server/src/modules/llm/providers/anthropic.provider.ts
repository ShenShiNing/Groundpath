import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatMessage, GenerateOptions } from './llm-provider.interface';
import type { LLMProviderType } from '@knowledge-agent/shared/types';
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

  async healthCheck(): Promise<boolean> {
    try {
      await this.generate([{ role: 'user', content: 'hi' }], { maxTokens: 5 });
      // Reaching provider API without exception means credentials/model are usable.
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ errorMessage, provider: 'anthropic' }, 'Health check failed');
      throw new Error(errorMessage);
    }
  }
}
