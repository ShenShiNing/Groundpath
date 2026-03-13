import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  describeImage: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  env: {
    vlmConfig: {
      concurrency: 1,
      timeoutMs: 30_000,
      maxRetries: 2,
      maxTokens: 1024,
    },
  },
}));

vi.mock('@config/env', () => mocks.env);

vi.mock('@core/logger', () => ({
  createLogger: () => ({
    warn: mocks.loggerWarn,
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  }),
}));

vi.mock('@modules/vlm/vlm.factory', () => ({
  getVLMProvider: () => ({
    describeImage: mocks.describeImage,
  }),
}));

import { vlmService } from '@modules/vlm/vlm.service';

const baseInput = {
  image: {
    base64: 'aGVsbG8=',
    mimeType: 'image/png',
  },
  userPrompt: 'Describe this image',
};

describe('vlm.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should pass default maxTokens and temperature to provider', async () => {
    mocks.describeImage.mockResolvedValueOnce('a detailed description');

    const result = await vlmService.describeImage(baseInput);

    expect(result).toBe('a detailed description');
    expect(mocks.describeImage).toHaveBeenCalledWith({
      image: baseInput.image,
      systemPrompt: undefined,
      userPrompt: 'Describe this image',
      maxTokens: 1024,
      temperature: 0.2,
    });
  });

  it('should retry retryable provider errors and eventually succeed', async () => {
    vi.useFakeTimers();
    mocks.describeImage
      .mockRejectedValueOnce(Object.assign(new Error('temporary failure'), { status: 500 }))
      .mockResolvedValueOnce('recovered');

    const promise = vlmService.describeImage(baseInput);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe('recovered');
    expect(mocks.describeImage).toHaveBeenCalledTimes(2);
  });

  it('should not retry non-retryable provider errors', async () => {
    mocks.describeImage.mockRejectedValueOnce(
      Object.assign(new Error('bad request'), { status: 400 })
    );

    await expect(vlmService.describeImage(baseInput)).rejects.toThrow('bad request');
    expect(mocks.describeImage).toHaveBeenCalledTimes(1);
  });

  it('should timeout long-running VLM calls', async () => {
    vi.useFakeTimers();
    mocks.describeImage.mockImplementation(() => new Promise<string>(() => {}));

    const promise = vlmService.describeImage(baseInput);
    const expectation = expect(promise).rejects.toThrow('VLM call timed out after 30000ms');
    await vi.advanceTimersByTimeAsync(30_000);
    await expectation;
  });

  it('should return settled results for batch requests', async () => {
    mocks.describeImage
      .mockResolvedValueOnce('desc-1')
      .mockRejectedValueOnce(new Error('vision failed'))
      .mockResolvedValueOnce('desc-3');

    const results = await vlmService.describeImageBatch([
      baseInput,
      { ...baseInput, userPrompt: 'Describe image 2' },
      { ...baseInput, userPrompt: 'Describe image 3' },
    ]);

    expect(results).toEqual([
      { index: 0, description: 'desc-1', success: true },
      { index: 1, description: null, success: false, error: 'vision failed' },
      { index: 2, description: 'desc-3', success: true },
    ]);
  });
});
