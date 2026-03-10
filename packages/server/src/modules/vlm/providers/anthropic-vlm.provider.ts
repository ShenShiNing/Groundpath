import Anthropic from '@anthropic-ai/sdk';
import type { VLMProvider, VLMDescribeOptions } from '../vlm-provider.interface';

export class AnthropicVLMProvider implements VLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string, baseUrl?: string) {
    this.client = new Anthropic({ apiKey, baseURL: baseUrl });
    this.model = model;
  }

  async describeImage(options: VLMDescribeOptions): Promise<string> {
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: options.image.mimeType as
            | 'image/png'
            | 'image/jpeg'
            | 'image/gif'
            | 'image/webp',
          data: options.image.base64,
        },
      },
      { type: 'text', text: options.userPrompt },
    ];

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.2,
        system: options.systemPrompt,
        messages: [{ role: 'user', content }],
      },
      { signal: options.signal }
    );

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock?.text?.trim() ?? '';
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
