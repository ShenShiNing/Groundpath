import type { EmbeddingProvider } from '../embedding.types';
import { embeddingConfig, externalServiceConfig } from '@config/env';
import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';
import pLimit from 'p-limit';
import { executeExternalCall } from '@core/utils/external-call';

const logger = createLogger('embedding.ollama');

const DIMENSIONS_MAP: Record<string, number> = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
};

interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaEmbeddingsResponse {
  embeddings: number[][];
}

export class OllamaProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly dimensions: number;
  private readonly timeout = 60_000; // 60s timeout for local model

  constructor() {
    this.baseUrl = embeddingConfig.ollama.baseUrl;
    this.model = embeddingConfig.ollama.model;
    this.dimensions = DIMENSIONS_MAP[this.model] ?? 768;
    logger.info(
      { model: this.model, baseUrl: this.baseUrl, dimensions: this.dimensions },
      'Ollama provider initialized'
    );
  }

  async embed(text: string): Promise<number[]> {
    const data = await executeExternalCall<OllamaEmbeddingResponse>({
      service: 'embedding',
      operation: 'ollama.embed',
      policy: { ...externalServiceConfig.embedding, timeoutMs: this.timeout },
      execute: (signal) =>
        fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, prompt: text }),
          signal,
        }).then(async (response) => {
          if (!response.ok) {
            const errorText = await response.text();
            throw Errors.external(
              `Ollama API error (${response.status}): ${errorText}`,
              undefined,
              response.status
            );
          }
          return (await response.json()) as OllamaEmbeddingResponse;
        }),
    });

    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Try the /api/embed endpoint (Ollama 0.4.0+) which supports batch input
    try {
      const data = await executeExternalCall<OllamaEmbeddingsResponse>({
        service: 'embedding',
        operation: 'ollama.embedBatch',
        policy: { ...externalServiceConfig.embedding, timeoutMs: this.timeout },
        execute: (signal) =>
          fetch(`${this.baseUrl}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: this.model, input: texts }),
            signal,
          }).then(async (response) => {
            if (!response.ok) {
              throw Errors.external(
                `Ollama batch API error (${response.status}): ${response.statusText}`,
                undefined,
                response.status
              );
            }
            return (await response.json()) as OllamaEmbeddingsResponse;
          }),
      });
      return data.embeddings;
    } catch (error) {
      // Fall back to sequential embedding for other errors
    }

    // Fallback: use p-limit for controlled concurrency
    const limit = pLimit(embeddingConfig.concurrency);
    const promises = texts.map((text) => limit(() => this.embed(text)));
    return Promise.all(promises);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getName(): string {
    return `ollama/${this.model}`;
  }
}
