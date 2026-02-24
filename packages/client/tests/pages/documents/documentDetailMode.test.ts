import { describe, expect, it } from 'vitest';
import { getDefaultDocumentMode, syncDocumentMode } from '@/pages/documents/documentDetailMode';

describe('documentDetailMode', () => {
  it('defaults to edit mode when document is editable', () => {
    expect(getDefaultDocumentMode(true)).toBe('edit');
  });

  it('keeps current mode while content is still loading', () => {
    expect(
      syncDocumentMode({
        currentMode: 'read',
        isEditable: true,
        isContentReady: false,
        hasUserSelectedMode: false,
      })
    ).toBe('read');
  });

  it('auto switches to edit when editable content becomes ready', () => {
    expect(
      syncDocumentMode({
        currentMode: 'read',
        isEditable: true,
        isContentReady: true,
        hasUserSelectedMode: false,
      })
    ).toBe('edit');
  });

  it('respects user-selected mode after manual switch', () => {
    expect(
      syncDocumentMode({
        currentMode: 'read',
        isEditable: true,
        isContentReady: true,
        hasUserSelectedMode: true,
      })
    ).toBe('read');
  });

  it('forces read mode when document is not editable', () => {
    expect(
      syncDocumentMode({
        currentMode: 'edit',
        isEditable: false,
        isContentReady: true,
        hasUserSelectedMode: true,
      })
    ).toBe('read');
  });
});
