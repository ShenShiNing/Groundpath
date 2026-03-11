import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

export interface RenderResult {
  container: HTMLDivElement;
  rerender: (ui: ReactElement) => Promise<void>;
  unmount: () => Promise<void>;
}

export async function render(ui: ReactElement): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);

  await act(async () => {
    root.render(ui);
  });

  return {
    container,
    rerender: async (nextUi: ReactElement) => {
      await act(async () => {
        root.render(nextUi);
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export async function fireClick(element: Element | null): Promise<void> {
  if (!element) {
    throw new Error('Target element not found');
  }

  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

export async function fireInput(
  element: HTMLInputElement | HTMLTextAreaElement | null,
  value: string
): Promise<void> {
  if (!element) {
    throw new Error('Target input element not found');
  }

  await act(async () => {
    const setter =
      element instanceof HTMLInputElement
        ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
