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
    this.baseUrl = normalizeCustomBaseUrl(baseUrl);
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
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as CustomResponse;
    const message = data.choices[0]?.message;
    return message?.content ?? message?.reasoning_content ?? '';
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
      signal: options?.signal,
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
        // Check if aborted before reading
        if (options?.signal?.aborted) {
          return;
        }

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
              // Only yield content; ignore reasoning_content during streaming
              // to avoid exposing thinking process from reasoning models.
              if (delta?.content) yield delta.content;
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
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Custom API error: ${response.status}${errorText ? ` - ${errorText.slice(0, 300)}` : ''}`
        );
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error && error.cause ? String(error.cause) : undefined;
      logger.warn(
        { errorMessage, cause, baseUrl: this.baseUrl, provider: 'custom' },
        'Health check failed'
      );
      throw new Error(errorMessage);
    }
  }
}

function normalizeCustomBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1\/chat\/completions$/i, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/v1\/models$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/v1$/i, '');
}
