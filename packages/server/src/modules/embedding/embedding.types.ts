export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
  getName(): string;
}

export type EmbeddingProviderType = 'zhipu' | 'openai' | 'ollama';
