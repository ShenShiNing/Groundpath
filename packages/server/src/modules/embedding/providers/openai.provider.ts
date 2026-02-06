import OpenAI from 'openai';
import type { EmbeddingProvider } from '../embedding.types';
import { embeddingConfig } from '@config/env';
import { createLogger } from '@shared/logger';

const logger = createLogger('embedding.openai');

const DIMENSIONS_MAP: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

export class OpenAIProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly dimensions: number;

  constructor() {
    if (!embeddingConfig.openai.apiKey) {
      throw new Error('OPENAI_API_KEY is required when using openai embedding provider');
    }
    this.client = new OpenAI({ apiKey: embeddingConfig.openai.apiKey });
    this.model = embeddingConfig.openai.model;
    this.dimensions = DIMENSIONS_MAP[this.model] ?? 1536;
    logger.info({ model: this.model, dimensions: this.dimensions }, 'OpenAI provider initialized');
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
    });
    return response.data[0]!.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // OpenAI supports batch input natively
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });
    // Sort by index to maintain order
    return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getName(): string {
    return `openai/${this.model}`;
  }
}
