import type {
  LLMProvider,
  ChatMessage,
  GenerateOptions,
  StreamChunk,
  AgentMessage,
  GenerateWithToolsOptions,
  ToolGenerateResult,
} from './llm-provider.interface';
import type { LLMProviderType } from '@groundpath/shared/types';
import { externalServiceConfig } from '@config/env';
import { Errors } from '@core/errors';
import { openaiCompatGenerateWithTools } from './openai-compat';
import { logger } from '@core/logger';
import { executeExternalCall } from '@core/utils/external-call';

interface ZhipuChoice {
  message: { content: string; reasoning_content?: string };
}

interface ZhipuResponse {
  choices: ZhipuChoice[];
}

interface ZhipuStreamChoice {
  delta: { content?: string; reasoning_content?: string };
}

interface ZhipuStreamChunk {
  choices: ZhipuStreamChoice[];
}

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

export class ZhipuProvider implements LLMProvider {
  readonly name: LLMProviderType = 'zhipu';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<string> {
    const response = await executeExternalCall({
      service: 'llm',
      operation: `${this.name}.generate`,
      policy: externalServiceConfig.llm,
      signal: options?.signal,
      execute: (signal) =>
        fetch(ZHIPU_API_URL, {
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
          signal,
        }).then(async (result) => {
          if (!result.ok) {
            const errorText = await result.text();
            throw Errors.external(
              `Zhipu API error: ${result.status} - ${errorText}`,
              undefined,
              result.status
            );
          }
          return result;
        }),
    });

    const data = (await response.json()) as ZhipuResponse;
    const message = data.choices[0]?.message;
    return message?.content ?? message?.reasoning_content ?? '';
  }

  async *streamGenerate(
    messages: ChatMessage[],
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const response = await fetch(ZHIPU_API_URL, {
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
      throw Errors.external(`Zhipu API error: ${response.status} ${response.statusText}`);
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
              const chunk = JSON.parse(data) as ZhipuStreamChunk;
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
      this.name,
      ZHIPU_API_URL,
      this.apiKey,
      this.model,
      messages,
      options
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(ZHIPU_API_URL, {
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
          `Zhipu API error: ${response.status}${errorText ? ` - ${errorText.slice(0, 300)}` : ''}`
        );
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn({ errorMessage, provider: 'zhipu' }, 'Health check failed');
      throw Errors.external(errorMessage);
    }
  }
}
