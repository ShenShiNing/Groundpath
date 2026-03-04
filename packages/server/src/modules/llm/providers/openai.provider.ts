import OpenAI from 'openai';
import type { LLMProvider, ChatMessage, GenerateOptions } from './llm-provider.interface';
import type { LLMProviderType } from '@knowledge-agent/shared/types';
import { logger } from '@shared/logger';

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
      throw new Error(errorMessage);
    }
  }
}
