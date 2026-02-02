import type { EmbeddingProvider } from '../embedding.types';
import { env } from '@config/env';
import { createLogger } from '@shared/logger';

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
    this.baseUrl = env.OLLAMA_BASE_URL;
    this.model = env.OLLAMA_EMBEDDING_MODEL;
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
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as OllamaEmbeddingResponse;
      return data.embedding;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Ollama API request timed out after ${this.timeout / 1000}s`);
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
        throw new Error(`Ollama API batch request timed out after ${this.timeout / 1000}s`);
      }
      // Fall back to sequential embedding for other errors
    } finally {
      clearTimeout(timeoutId);
    }

    // Fallback: sequential embedding
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getName(): string {
    return `ollama/${this.model}`;
  }
}
