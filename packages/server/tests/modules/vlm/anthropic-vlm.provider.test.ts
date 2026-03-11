import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mocks.messagesCreate,
    };
  },
}));

import { AnthropicVLMProvider } from '@modules/vlm/providers/anthropic-vlm.provider';

describe('AnthropicVLMProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send image and prompt blocks to Anthropic and trim text result', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [
        { type: 'text', text: '  anthropic image summary  ' },
        { type: 'text', text: 'secondary block' },
      ],
    });

    const provider = new AnthropicVLMProvider(
      'test-key',
      'claude-3-7-sonnet',
      'https://anthropic.example.com'
    );
    const result = await provider.describeImage({
      systemPrompt: 'Use precise visual descriptions.',
      userPrompt: 'Describe the diagram',
      image: {
        base64: 'aGVsbG8=',
        mimeType: 'image/png',
      },
      maxTokens: 333,
      temperature: 0.4,
    });

    expect(result).toBe('anthropic image summary');
    expect(mocks.messagesCreate).toHaveBeenCalledWith(
      {
        model: 'claude-3-7-sonnet',
        max_tokens: 333,
        temperature: 0.4,
        system: 'Use precise visual descriptions.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'aGVsbG8=',
                },
              },
              { type: 'text', text: 'Describe the diagram' },
            ],
          },
        ],
      },
      { signal: undefined }
    );
  });

  it('should default max_tokens to 1024 and temperature to 0.2', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
    });

    const provider = new AnthropicVLMProvider('test-key', 'claude-3-7-sonnet');
    await provider.describeImage({
      userPrompt: 'Describe',
      image: {
        base64: 'YmFzZTY0',
        mimeType: 'image/jpeg',
      },
    });

    expect(mocks.messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 1024,
        temperature: 0.2,
      }),
      { signal: undefined }
    );
  });

  it('should return healthCheck true on success and false on failure', async () => {
    const provider = new AnthropicVLMProvider('test-key', 'claude-3-7-sonnet');

    mocks.messagesCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'pong' }],
    });
    await expect(provider.healthCheck()).resolves.toBe(true);

    mocks.messagesCreate.mockRejectedValueOnce(new Error('invalid api key'));
    await expect(provider.healthCheck()).resolves.toBe(false);
  });
});
