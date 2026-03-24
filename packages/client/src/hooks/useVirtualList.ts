import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface UseVirtualListOptions {
  count: number;
  estimateSize: number;
  overscan?: number;
}

export function useVirtualList({ count, estimateSize, overscan = 5 }: UseVirtualListOptions) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
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
