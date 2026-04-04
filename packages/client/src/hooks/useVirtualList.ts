import { useRef } from 'react';
import { useElementVirtualizer } from './useElementVirtualizer';

interface UseVirtualListOptions {
  count: number;
  estimateSize: number;
  overscan?: number;
}

export function useVirtualList({ count, estimateSize, overscan = 5 }: UseVirtualListOptions) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useElementVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  return {
    parentRef,
    virtualizer,
    totalHeight: virtualizer.getTotalSize(),
    virtualItems: virtualizer.getVirtualItems(),
  };
}
