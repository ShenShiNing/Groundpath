import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeDoclingMarkdown } from '@modules/document-index/services/parsers/docling-markdown-normalizer';
import { pdfStructureParser } from '@modules/document-index/services/parsers/pdf-structure.parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, '../../fixtures/document-index/docling');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixtureDir, name), 'utf-8');
}

describe('pdfStructureParser docling fixtures', () => {
  it('normalizes book-style docling output into cleaner markdown headings and toc rows', () => {
    const normalized = normalizeDoclingMarkdown(readFixture('book-nist-snippet.md'));
    const result = pdfStructureParser.parseDoclingMarkdown(readFixture('book-nist-snippet.md'));

    expect(normalized).toContain('| 1. | Introduction');
    expect(normalized).not.toContain(
      '| Introduction ..............................................................................................................................................1 | Introduction'
    );
    expect(normalized).toContain('## 1. Introduction');
    expect(normalized).toContain('cross-sectoral profile');
    expect(normalized).toContain('profiles assist organizations');
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Table of Contents',
          sectionPath: ['Front Matter', 'Table of Contents'],
        }),
      ])
    );
  });

  it('builds stable section nodes from paper-style docling output', () => {
    const result = pdfStructureParser.parseDoclingMarkdown(
      readFixture('paper-attention-snippet.md')
    );

    expect(result.parserRuntime).toBe('docling');
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Abstract',
          sectionPath: ['Abstract'],
        }),
        expect.objectContaining({
          title: '1 Introduction',
          sectionPath: ['1 Introduction'],
        }),
        expect.objectContaining({
          title: '3.1 Encoder and Decoder Stacks',
          sectionPath: ['3.1 Encoder and Decoder Stacks'],
        }),
        expect.objectContaining({
          nodeType: 'figure',
          title: 'Figure 1: The Transformer-model architecture.',
        }),
        expect.objectContaining({
          title: '3.2.1 Scaled Dot-Product Attention',
        }),
        expect.objectContaining({
          title: 'Attention Is All You Need',
          sectionPath: ['Front Matter', 'Attention Is All You Need'],
        }),
      ])
    );
  });

  it('demotes synthetic callout noise while preserving table and appendix sections', () => {
    const normalized = normalizeDoclingMarkdown(readFixture('synthetic-chart-snippet.md'));
    const result = pdfStructureParser.parseDoclingMarkdown(
      readFixture('synthetic-chart-snippet.md')
    );

    expect(normalized).not.toContain('## Callout');
    expect(normalized).not.toContain('## Demand index');
    expect(normalized).toContain('| Metric | Baseline | Scenario A | Scenario B |');
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '1. Key findings' }),
        expect.objectContaining({ title: '2. Figure-heavy analysis pages' }),
        expect.objectContaining({ title: '3. Tables and appendix anchors' }),
        expect.objectContaining({ title: 'Appendix anchors' }),
        expect.objectContaining({ nodeType: 'figure', title: 'Figure 2-1. Regional demand index' }),
        expect.objectContaining({ nodeType: 'table', title: 'Table 1' }),
        expect.objectContaining({
          nodeType: 'appendix',
          title: 'Appendix A. Assumptions for Figure 2-1',
        }),
      ])
    );
    expect(result.nodes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Callout' })])
    );
  });
});
