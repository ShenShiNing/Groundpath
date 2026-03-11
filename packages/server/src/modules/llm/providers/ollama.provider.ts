import type { LLMProvider, ChatMessage, GenerateOptions } from './llm-provider.interface';
import type { LLMProviderType } from '@knowledge-agent/shared/types';
import { Errors } from '@shared/errors';
import { logger } from '@shared/logger';

interface OllamaChatResponse {
  message: { content: string };
  done: boolean;
}

export class OllamaProvider implements LLMProvider {
  readonly name: LLMProviderType = 'ollama';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(model: string, baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
          top_p: options?.topP,
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw Errors.external(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    return data.message?.content ?? '';
  }

  async *streamGenerate(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
          top_p: options?.topP,
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw Errors.external(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw Errors.external('No response body');

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
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line) as OllamaChatResponse;
            if (chunk.message?.content) {
              yield chunk.message.content;
            }
            if (chunk.done) return;
          } catch {
            // Skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw Errors.external(`Ollama API error: ${response.status} ${response.statusText}`);
      }
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ errorMessage, provider: 'ollama' }, 'Health check failed');
      throw Errors.external(errorMessage);
    }
  }
}
