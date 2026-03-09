import { describe, expect, it } from 'vitest';
import { normalizeDoclingMarkdown } from '@modules/document-index/services/parsers/docling-markdown-normalizer';

describe('normalizeDoclingMarkdown', () => {
  it('normalizes whitespace and common broken tokens', () => {
    const result =
      normalizeDoclingMarkdown(`As GAI covers risks that are cross -sectoral profi le s.

This can help de sign safer systems.`);

    expect(result).toContain('cross-sectoral profiles.');
    expect(result).toContain('design safer systems.');
  });

  it('demotes noisy KPI and callout headings while keeping numbered headings', () => {
    const result = normalizeDoclingMarkdown(`## Demand index

124

## 1. Key findings

- Scenario A

## Callout

Keep this note attached to the paragraph.`);

    expect(result).toContain('Demand index\n\n124');
    expect(result).toContain('## 1. Key findings');
    expect(result).not.toContain('## Demand index');
    expect(result).not.toContain('## Callout');
  });

  it('deduplicates repeated markdown table columns', () => {
    const result = normalizeDoclingMarkdown(`| 1. | Introduction | Introduction |
| --- | --- | --- |
| 2. | Risks | Risks |`);

    expect(result).toContain('| 1. | Introduction |');
    expect(result).not.toContain('| Introduction | Introduction |');
    expect(result).toContain('| 2. | Risks |');
  });
});
