export interface VLMImageInput {
  base64: string;
  mimeType: string;
}

export interface VLMDescribeOptions {
  systemPrompt?: string;
  userPrompt: string;
  image: VLMImageInput;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface VLMProvider {
  readonly name: string;
  describeImage(options: VLMDescribeOptions): Promise<string>;
  healthCheck(): Promise<boolean>;
}
