import { useCallback, useEffect, useRef, useState } from 'react';
import { useElementVirtualizer } from './useElementVirtualizer';

interface BreakpointColumns {
  /** min-width → column count, checked in descending order */
  breakpoints: [number, number][];
  /** fallback column count */
  default: number;
}

interface UseVirtualGridOptions<T> {
  items: T[];
  columns: BreakpointColumns;
  estimateRowHeight: number;
  gap?: number;
  overscan?: number;
}

function getColumnCount(width: number, config: BreakpointColumns): number {
  for (const [minWidth, cols] of config.breakpoints) {
    if (width >= minWidth) return cols;
  }
  return config.default;
}

export function useVirtualGrid<T>({
  items,
  columns,
  estimateRowHeight,
  gap = 16,
  overscan = 3,
}: UseVirtualGridOptions<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(columns.default);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setColumnCount(getColumnCount(width, columns));
    });

    observer.observe(el);
    setColumnCount(getColumnCount(el.clientWidth, columns));

    return () => observer.disconnect();
  }, [columns]);

  const rowCount = Math.ceil(items.length / columnCount);

  const virtualizer = useElementVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight + gap,
    overscan,
  });

  const getRowItems = useCallback(
    (rowIndex: number): T[] => {
      const start = rowIndex * columnCount;
      return items.slice(start, start + columnCount);
    },
    [items, columnCount]
  );

  return {
    parentRef,
    virtualizer,
    columnCount,
    getRowItems,
    totalHeight: virtualizer.getTotalSize(),
    virtualRows: virtualizer.getVirtualItems(),
    gap,
  };
}
