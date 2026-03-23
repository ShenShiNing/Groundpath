import React, { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  markdownRenderer: vi.fn(),
  toastSuccess: vi.fn(),
}));
const themeState = vi.hoisted(() => ({
  theme: 'dark' as 'dark' | 'light' | 'system',
}));

vi.mock('@uiw/react-md-editor/nohighlight', () => ({
  default: {
    Markdown: ({
      source,
    }: {
      source?: string;
      className?: string;
      components?: Record<string, unknown>;
    }) => {
      mocks.markdownRenderer(source);
      return <div data-testid="markdown-renderer">{source}</div>;
    },
  },
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/components/theme/theme-provider', () => ({
  useTheme: () => themeState,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import type { Citation } from '@/stores';

async function waitFor(assertion: () => void) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flushPromises();
  }

  throw lastError instanceof Error ? lastError : new Error('Condition was not met');
}

describe('ChatMarkdown', () => {
  const citation: Citation = {
    id: 'cit-1',
    documentId: 'doc-1',
    documentTitle: 'Guide',
    excerpt: 'Citation excerpt',
    sourceType: 'chunk',
    chunkIndex: 0,
    content: 'Citation excerpt',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    themeState.theme = 'dark';
  });

  it('renders markdown progressively while streaming and keeps the cursor visible', async () => {
    const expectedSource = '# Streaming answer\n\nWith citation [1](#citation-1)';
    const view = await render(
      <ChatMarkdown
        content={'# Streaming answer\n\nWith citation [1]'}
        citations={[citation]}
        onCitationClick={vi.fn()}
        isStreaming
      />
    );

    await waitFor(() => {
      expect(mocks.markdownRenderer).toHaveBeenLastCalledWith(expectedSource);
      expect(view.container.querySelector('[data-testid="markdown-renderer"]')?.textContent).toBe(
        expectedSource
      );
    });

    expect(view.container.querySelector('[aria-hidden="true"]')).not.toBeNull();

    await view.unmount();
  });

  it('falls back to the full markdown renderer after streaming ends', async () => {
    const expectedSource = 'Final answer [1](#citation-1)';
    const view = await render(
      <ChatMarkdown content="Final answer [1]" citations={[citation]} onCitationClick={vi.fn()} />
    );

    await waitFor(() => {
      expect(mocks.markdownRenderer).toHaveBeenLastCalledWith(expectedSource);
      expect(view.container.querySelector('[data-testid="markdown-renderer"]')?.textContent).toBe(
        expectedSource
      );
    });

    await view.unmount();
  });

  it('updates markdown color mode when the theme changes', async () => {
    const view = await render(
      <ChatMarkdown content="Theme aware" citations={[citation]} onCitationClick={vi.fn()} />
    );

    await waitFor(() => {
      expect(view.container.querySelector('[data-color-mode="dark"]')).not.toBeNull();
    });

    themeState.theme = 'light';
    await view.rerender(
      <ChatMarkdown content="Theme aware" citations={[citation]} onCitationClick={vi.fn()} />
    );

    await waitFor(() => {
      expect(view.container.querySelector('[data-color-mode="light"]')).not.toBeNull();
    });

    await view.unmount();
  });
});
