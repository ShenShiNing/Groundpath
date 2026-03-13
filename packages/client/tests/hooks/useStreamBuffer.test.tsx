import React, { useEffect } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamBuffer, type UseStreamBufferResult } from '../../src/hooks/useStreamBuffer';
import { flushPromises, render } from '../utils/render';

describe('useStreamBuffer', () => {
  let controls: UseStreamBufferResult | null = null;
  let frameId = 0;
  let scheduledFrames: Array<{ id: number; callback: FrameRequestCallback }> = [];

  function TestHarness({
    append,
    onReady,
  }: {
    append: (text: string) => void;
    onReady: (nextControls: UseStreamBufferResult) => void;
  }) {
    const streamBuffer = useStreamBuffer(append);

    useEffect(() => {
      onReady(streamBuffer);
    }, [onReady, streamBuffer]);

    return null;
  }

  async function runAnimationFrame(timestamp = 16) {
    const frameBatch = scheduledFrames;
    scheduledFrames = [];

    await act(async () => {
      frameBatch.forEach(({ callback }) => callback(timestamp));
    });
  }

  beforeEach(() => {
    controls = null;
    frameId = 0;
    scheduledFrames = [];

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameId += 1;
      scheduledFrames.push({ id: frameId, callback });
      return frameId;
    });

    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      scheduledFrames = scheduledFrames.filter((frame) => frame.id !== id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('coalesces multiple pushes into a single frame flush', async () => {
    const append = vi.fn();
    const view = await render(
      <TestHarness append={append} onReady={(next) => (controls = next)} />
    );
    await flushPromises();

    await act(async () => {
      controls!.push('Hel');
      controls!.push('lo');
    });

    expect(append).not.toHaveBeenCalled();

    await runAnimationFrame();

    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith('Hello');

    await view.unmount();
  });

  it('flushes pending text when the hook owner unmounts', async () => {
    const append = vi.fn();
    const view = await render(
      <TestHarness append={append} onReady={(next) => (controls = next)} />
    );
    await flushPromises();

    await act(async () => {
      controls!.push('tail');
    });

    await view.unmount();

    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith('tail');
  });
});
