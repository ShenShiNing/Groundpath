import { useCallback, useEffect, useMemo, useRef } from 'react';

export interface UseStreamBufferResult {
  push: (text: string) => void;
  flush: () => void;
  reset: () => void;
}

export function useStreamBuffer(appendFn: (text: string) => void): UseStreamBufferResult {
  const appendRef = useRef(appendFn);
  const bufferRef = useRef('');
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    appendRef.current = appendFn;
  }, [appendFn]);

  const flush = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (!bufferRef.current) {
      return;
    }

    const nextText = bufferRef.current;
    bufferRef.current = '';
    appendRef.current(nextText);
  }, []);

  const push = useCallback(
    (text: string) => {
      if (!text) return;

      bufferRef.current += text;
      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        flush();
      });
    },
    [flush]
  );

  const reset = useCallback(() => {
    bufferRef.current = '';
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return useMemo(
    () => ({
      push,
      flush,
      reset,
    }),
    [flush, push, reset]
  );
}
