import type { EmbeddingProvider } from '../embedding.types';
import { env } from '@config/env';
import { createLogger } from '@shared/logger';

const logger = createLogger('embedding.zhipu');

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/embeddings';

interface ZhipuEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

export class ZhipuProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dimensions: number;

  constructor() {
    if (!env.ZHIPU_API_KEY) {
      throw new Error('ZHIPU_API_KEY is required when using zhipu embedding provider');
    }
    this.apiKey = env.ZHIPU_API_KEY;
    this.model = env.ZHIPU_EMBEDDING_MODEL;
    this.dimensions = env.ZHIPU_EMBEDDING_DIMENSIONS;
    logger.info({ model: this.model, dimensions: this.dimensions }, 'Zhipu provider initialized');
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result[0]!;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    // Zhipu API supports single input per request, so we batch sequentially
    // For better performance, process in parallel with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const promises = batch.map((text) => this.callApi(text));
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return results;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getName(): string {
    return `zhipu/${this.model}`;
  }

  private async callApi(text: string): Promise<number[]> {
    const body: Record<string, unknown> = {
      model: this.model,
      input: text,
    };

    // embedding-3 supports custom dimensions
    if (this.model === 'embedding-3') {
      body.dimensions = this.dimensions;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(ZHIPU_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Zhipu API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as ZhipuEmbeddingResponse;
      if (!data.data?.[0]?.embedding) {
        throw new Error(
          `Zhipu API returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`
        );
      }
      return data.data[0].embedding;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          `Zhipu API request timed out after 30s (input length: ${text.length} chars)`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
