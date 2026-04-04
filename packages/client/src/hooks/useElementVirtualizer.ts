import { useEffect, useLayoutEffect, useReducer, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from '@tanstack/react-virtual';
import type { PartialKeys, VirtualizerOptions } from '@tanstack/react-virtual';

const useIsomorphicLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

type ElementVirtualizerOptions<
  TScrollElement extends Element,
  TItemElement extends Element,
> = PartialKeys<
  VirtualizerOptions<TScrollElement, TItemElement>,
  'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
> & {
  useFlushSync?: boolean;
};

export function useElementVirtualizer<
  TScrollElement extends Element,
  TItemElement extends Element,
>({ useFlushSync = true, ...options }: ElementVirtualizerOptions<TScrollElement, TItemElement>) {
  const rerender = useReducer(() => ({}), {})[1];

  const resolvedOptions: VirtualizerOptions<TScrollElement, TItemElement> = {
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...options,
    onChange: (instance, sync) => {
      if (useFlushSync && sync) {
        flushSync(rerender);
      } else {
        rerender();
      }

      options.onChange?.(instance, sync);
    },
  };

  const [instance] = useState(() => new Virtualizer<TScrollElement, TItemElement>(resolvedOptions));

  instance.setOptions(resolvedOptions);

  useIsomorphicLayoutEffect(() => instance._didMount(), [instance]);
  useIsomorphicLayoutEffect(() => instance._willUpdate());

  return instance;
}
