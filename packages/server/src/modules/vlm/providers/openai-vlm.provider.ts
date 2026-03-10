import OpenAI from 'openai';
import type { VLMProvider, VLMDescribeOptions } from '../vlm-provider.interface';

export class OpenAIVLMProvider implements VLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseUrl?: string) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.model = model;
  }

  async describeImage(options: VLMDescribeOptions): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: options.userPrompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${options.image.mimeType};base64,${options.image.base64}`,
          },
        },
      ],
    });

    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature ?? 0.2,
      },
      { signal: options.signal }
    );

    return response.choices[0]?.message?.content?.trim() ?? '';
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
