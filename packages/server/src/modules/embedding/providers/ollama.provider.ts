import type { EmbeddingProvider } from '../embedding.types';
import { embeddingConfig } from '@config/env';
import { Errors } from '@shared/errors';
import { createLogger } from '@shared/logger';
import pLimit from 'p-limit';

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw Errors.external(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;
      return data.embedding;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw Errors.timeout(`Ollama API request timed out after ${this.timeout / 1000}s`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Try the /api/embed endpoint (Ollama 0.4.0+) which supports batch input
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = (await response.json()) as OllamaEmbeddingsResponse;
        return data.embeddings;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw Errors.timeout(`Ollama API batch request timed out after ${this.timeout / 1000}s`);
      }
      // Fall back to sequential embedding for other errors
    } finally {
      clearTimeout(timeoutId);
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
