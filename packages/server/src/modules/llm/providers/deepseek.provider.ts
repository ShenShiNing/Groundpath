import type {
  LLMProvider,
  ChatMessage,
  GenerateOptions,
  StreamChunk,
  AgentMessage,
  GenerateWithToolsOptions,
  ToolGenerateResult,
} from './llm-provider.interface';
import type { LLMProviderType } from '@knowledge-agent/shared/types';
import { Errors } from '@core/errors';
import { openaiCompatGenerateWithTools } from './openai-compat';
import { logger } from '@core/logger';

// DeepSeek uses OpenAI-compatible API format
interface DeepSeekResponse {
  choices: Array<{ message: { content: string; reasoning_content?: string } }>;
}

interface DeepSeekStreamChunk {
  choices: Array<{ delta: { content?: string; reasoning_content?: string } }>;
}

export class DeepSeekProvider implements LLMProvider {
  readonly name: LLMProviderType = 'deepseek';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string = 'https://api.deepseek.com';

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
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
      throw Errors.external(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as DeepSeekResponse;
    const message = data.choices[0]?.message;
    return message?.content ?? message?.reasoning_content ?? '';
  }

  async *streamGenerate(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
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
      throw Errors.external(`DeepSeek API error: ${response.status} ${response.statusText}`);
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
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try {
              const chunk = JSON.parse(data) as DeepSeekStreamChunk;
              const delta = chunk.choices[0]?.delta;
              if (delta?.reasoning_content)
                yield { type: 'reasoning', text: delta.reasoning_content };
              if (delta?.content) yield { type: 'content', text: delta.content };
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

  async generateWithTools(
    messages: AgentMessage[],
    options: GenerateWithToolsOptions
  ): Promise<ToolGenerateResult> {
    return openaiCompatGenerateWithTools(
      `${this.baseUrl}/v1/chat/completions`,
      this.apiKey,
      this.model,
      messages,
      options
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Make a lightweight chat call to validate credentials/model.
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
        throw Errors.external(
          `DeepSeek API error: ${response.status}${errorText ? ` - ${errorText.slice(0, 300)}` : ''}`
        );
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error && error.cause ? String(error.cause) : undefined;
      logger.warn(
        { errorMessage, cause, baseUrl: this.baseUrl, provider: 'deepseek' },
        'Health check failed'
      );
      throw Errors.external(errorMessage);
    }
  }
}
