import type { LLMProvider, ChatMessage, GenerateOptions } from './llm-provider.interface';
import type { LLMProviderType } from '@knowledge-agent/shared/types';
import { logger } from '@shared/logger';

/**
 * Custom provider for third-party proxies (OpenAI-compatible API)
 */
interface CustomResponse {
  choices: Array<{ message: { content: string; reasoning_content?: string } }>;
}

interface CustomStreamChunk {
  choices: Array<{ delta: { content?: string; reasoning_content?: string } }>;
}

export class CustomProvider implements LLMProvider {
  readonly name: LLMProviderType = 'custom';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, model: string, baseUrl: string) {
    if (!baseUrl) throw new Error('Base URL is required for custom provider');
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as CustomResponse;
    const message = data.choices[0]?.message;
    // Only return content, not reasoning_content (which contains thinking process)
    return message?.content || '';
  }

  async *streamGenerate(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
        top_p: options?.topP,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try {
              const chunk = JSON.parse(data) as CustomStreamChunk;
              const delta = chunk.choices[0]?.delta;
              // Only yield content, not reasoning_content (which contains thinking process)
              const content = delta?.content;
              if (content) yield content;
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.generate([{ role: 'user', content: 'hi' }], { maxTokens: 5 });
      return !!result;
    } catch (error) {
      const errorObj = error as { status?: number };
      // If we got an HTTP response, the connection is valid
      if (errorObj.status !== undefined) {
        logger.info(
          { status: errorObj.status, provider: 'custom' },
          'Health check passed (API reachable)'
        );
        return true;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error && error.cause ? String(error.cause) : undefined;
      logger.warn(
        { errorMessage, cause, baseUrl: this.baseUrl, provider: 'custom' },
        'Health check failed'
      );
      return false;
    }
  }
}
