import React, { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '@/components/theme/theme-provider';
import { fireClick, render } from '../../utils/render';

type MatchMediaListener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MatchMediaListener>();

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_event: 'change', listener: MatchMediaListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: 'change', listener: MatchMediaListener) => {
      listeners.delete(listener);
    },
    addListener: (listener: MatchMediaListener) => {
      listeners.add(listener);
    },
    removeListener: (listener: MatchMediaListener) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  } as MediaQueryList;

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQueryList)
  );

  return {
    setMatches: async (nextMatches: boolean) => {
      matches = nextMatches;
      const event = { matches: nextMatches, media: mediaQueryList.media } as MediaQueryListEvent;

      await act(async () => {
        for (const listener of Array.from(listeners)) {
          listener(event);
        }
      });
    },
  };
}

function ThemeProbe() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <div data-testid="resolved-theme">{resolvedTheme}</div>
      <button type="button" onClick={() => setTheme('system')}>
        system
      </button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('resolves the current system theme immediately when switching to system mode', async () => {
    mockMatchMedia(false);

    const view = await render(
      <ThemeProvider defaultTheme="dark" storageKey="test-theme">
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(view.container.querySelector('[data-testid="theme"]')?.textContent).toBe('dark');
    expect(view.container.querySelector('[data-testid="resolved-theme"]')?.textContent).toBe(
      'dark'
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await fireClick(view.container.querySelector('button'));

    expect(view.container.querySelector('[data-testid="theme"]')?.textContent).toBe('system');
    expect(view.container.querySelector('[data-testid="resolved-theme"]')?.textContent).toBe(
      'light'
    );
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await view.unmount();
  });

  it('updates the resolved theme when the system preference changes', async () => {
    const matchMedia = mockMatchMedia(false);

    const view = await render(
      <ThemeProvider defaultTheme="system" storageKey="test-theme">
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(view.container.querySelector('[data-testid="resolved-theme"]')?.textContent).toBe(
      'light'
    );
    expect(document.documentElement.classList.contains('light')).toBe(true);

    await matchMedia.setMatches(true);

    expect(view.container.querySelector('[data-testid="resolved-theme"]')?.textContent).toBe(
      'dark'
    );
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);

    await view.unmount();
  });
});
