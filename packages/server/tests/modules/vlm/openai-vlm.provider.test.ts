import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completionsCreate: vi.fn(),
  modelsList: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: mocks.completionsCreate,
      },
    };

    models = {
      list: mocks.modelsList,
    };
  },
}));

import { OpenAIVLMProvider } from '@modules/vlm/providers/openai-vlm.provider';

describe('OpenAIVLMProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send system prompt and image data url to OpenAI', async () => {
    mocks.completionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '  image summary  ' } }],
    });

    const provider = new OpenAIVLMProvider('test-key', 'gpt-4o-mini', 'https://openai.example.com');
    const result = await provider.describeImage({
      systemPrompt: 'Follow the image policy',
      userPrompt: 'What is in the image?',
      image: {
        base64: 'aGVsbG8=',
        mimeType: 'image/png',
      },
      maxTokens: 400,
      temperature: 0.6,
    });

    expect(result).toBe('image summary');
    expect(mocks.completionsCreate).toHaveBeenCalledWith(
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Follow the image policy' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in the image?' },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,aGVsbG8=',
                },
              },
            ],
          },
        ],
        max_tokens: 400,
        temperature: 0.6,
      },
      { signal: undefined }
    );
  });

  it('should omit system message when not provided and default temperature to 0.2', async () => {
    mocks.completionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'plain result' } }],
    });

    const provider = new OpenAIVLMProvider('test-key', 'gpt-4o-mini');
    await provider.describeImage({
      userPrompt: 'Describe',
      image: {
        base64: 'YmFzZTY0',
        mimeType: 'image/jpeg',
      },
    });

    expect(mocks.completionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/jpeg;base64,YmFzZTY0' },
              },
            ],
          },
        ],
        temperature: 0.2,
      }),
      { signal: undefined }
    );
  });

  it('should return healthCheck true on successful model listing and false on failure', async () => {
    const provider = new OpenAIVLMProvider('test-key', 'gpt-4o-mini');

    mocks.modelsList.mockResolvedValueOnce([{ id: 'gpt-4o-mini' }]);
    await expect(provider.healthCheck()).resolves.toBe(true);

    mocks.modelsList.mockRejectedValueOnce(new Error('auth failed'));
    await expect(provider.healthCheck()).resolves.toBe(false);
  });
});
