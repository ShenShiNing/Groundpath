import React, { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../utils/render';

const mocks = vi.hoisted(() => ({
  markdownRenderer: vi.fn(),
  toastSuccess: vi.fn(),
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

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import type { Citation } from '@/stores';

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
  });

  it('renders markdown progressively while streaming and keeps the cursor visible', async () => {
    const view = await render(
      <ChatMarkdown
        content={'# Streaming answer\n\nWith citation [1]'}
        citations={[citation]}
        onCitationClick={vi.fn()}
        isStreaming
      />
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mocks.markdownRenderer).toHaveBeenCalledWith(
      '# Streaming answer\n\nWith citation [1](#citation-1)'
    );
    expect(view.container.querySelector('[data-testid="markdown-renderer"]')).not.toBeNull();
    expect(view.container.querySelector('[aria-hidden="true"]')).not.toBeNull();

    await view.unmount();
  });

  it('falls back to the full markdown renderer after streaming ends', async () => {
    const view = await render(
      <ChatMarkdown content="Final answer [1]" citations={[citation]} onCitationClick={vi.fn()} />
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mocks.markdownRenderer).toHaveBeenCalledWith('Final answer [1](#citation-1)');
    expect(
      view.container.querySelector('[data-testid="markdown-renderer"]')?.textContent
    ).toContain('[1](#citation-1)');

    await view.unmount();
  });
});
