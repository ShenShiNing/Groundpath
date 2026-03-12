import { describe, expect, it, vi } from 'vitest';
import { DocumentReader } from '@/components/documents/DocumentReader';
import { render } from '../../utils/render';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('DocumentReader', () => {
  it('should render markdown content and escape unsafe html', async () => {
    const view = await render(
      <DocumentReader
        documentType="markdown"
        textContent={
          '# Title\n\n**Bold**\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))'
        }
        storageUrl={null}
      />
    );

    expect(view.container.textContent).toContain('Title');
    expect(view.container.textContent).toContain('Bold');
    expect(view.container.textContent).toContain('<script>alert(1)</script>');
    expect(view.container.querySelector('script')).toBeNull();
    expect(view.container.innerHTML).not.toContain('javascript:alert');

    await view.unmount();
  });

  it('should render a download link for pdf previews', async () => {
    const view = await render(
      <DocumentReader
        documentType="pdf"
        textContent={null}
        storageUrl="https://example.com/document.pdf"
      />
    );

    const link = view.container.querySelector('a');

    expect(view.container.textContent).toContain('reader.pdfNotSupported');
    expect(link?.getAttribute('href')).toBe('https://example.com/document.pdf');
    expect(link?.textContent).toBe('reader.downloadToView');

    await view.unmount();
  });
});
