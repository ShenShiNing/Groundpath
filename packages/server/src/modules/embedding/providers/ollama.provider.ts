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
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OllamaEmbeddingResponse;
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Try the /api/embed endpoint (Ollama 0.4.0+) which supports batch input
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: texts }),
      });

      if (response.ok) {
        const data = (await response.json()) as OllamaEmbeddingsResponse;
        return data.embeddings;
      }
    } catch {
      // Fall back to sequential embedding
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
