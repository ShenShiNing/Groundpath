const PREFIX_TOKEN_PATTERN =
  /\b(cross|inter|multi|non|pre|post|re|de|co|pro|sub|trans|under|over)[ \t]+([a-z]{3,})\b/g;
const SUFFIX_TOKEN_PATTERN =
  /\b([a-z]{4,})[ \t]+(s|ed|ing|tion|tions|ment|ments|le|ly|ness|able|ible|ous|ive)\b/g;
const NUMBERED_HEADING_PATTERN =
  /^(?:\d+(?:\.\d+)*|chapter\s+\d+|appendix\s+[a-z0-9]+|abstract|references?|acknowledgements?)\b/i;
const DEMOTED_HEADING_TITLES = new Set(['callout']);

function collapseBlankLines(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n');
}

function normalizeSpacing(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\[\s+/g, '[')
    .replace(/\s+\)/g, ')')
    .replace(/\s+\]/g, ']');
}

function fixBrokenTokens(value: string): string {
  return value
    .replace(/\b([A-Za-z]{3,})[ \t]*-[ \t]*([A-Za-z]{2,})\b/g, '$1-$2')
    .replace(/\b(Figure|Table|Appendix)\s+([A-Z]?\d+)\s*-\s*(\d+)\b/g, '$1 $2-$3')
    .replace(PREFIX_TOKEN_PATTERN, '$1$2')
    .replace(SUFFIX_TOKEN_PATTERN, '$1$2')
    .replace(SUFFIX_TOKEN_PATTERN, '$1$2');
}

function isNumericLikeLine(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[$€£]?\d+(?:\.\d+)?%?$/.test(trimmed) || /^\d+(?:\s+\d+)+$/.test(trimmed);
}

function shouldDemoteHeading(
  title: string,
  nextNonEmptyLine: string | undefined,
  previousHeading: string | null
): boolean {
  const normalizedTitle = title.trim().replace(/\s+/g, ' ');
  const lowerTitle = normalizedTitle.toLowerCase();
  if (DEMOTED_HEADING_TITLES.has(lowerTitle)) return true;
  if (NUMBERED_HEADING_PATTERN.test(normalizedTitle)) return false;

  const wordCount = normalizedTitle.split(/\s+/).length;
  if (wordCount <= 3 && nextNonEmptyLine && isNumericLikeLine(nextNonEmptyLine)) {
    return true;
  }

  if (previousHeading && previousHeading.toLowerCase() === lowerTitle) {
    return true;
  }

  return false;
}

function normalizeHeadings(lines: string[]): string[] {
  const normalizedLines: string[] = [];
  let previousHeading: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (!headingMatch) {
      normalizedLines.push(line);
      continue;
    }

    const title = (headingMatch[2] ?? '').trim().replace(/\s+/g, ' ');
    const nextNonEmptyLine = lines
      .slice(index + 1)
      .find((item) => item.trim().length > 0)
      ?.trim();
    if (shouldDemoteHeading(title, nextNonEmptyLine, previousHeading)) {
      normalizedLines.push(title);
      continue;
    }

    normalizedLines.push(`${headingMatch[1]} ${title}`);
    previousHeading = title;
  }

  return normalizedLines;
}

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
}

function isMarkdownSeparatorLine(line: string): boolean {
  return /^\|\s*[:\-| ]+\|\s*$/.test(line.trim());
}

function dedupeDuplicateColumns(rows: string[][]): string[][] {
  if (rows.length === 0) return rows;

  const maxColumns = Math.max(...rows.map((row) => row.length));
  const paddedRows = rows.map((row) => {
    const padded = [...row];
    while (padded.length < maxColumns) padded.push('');
    return padded;
  });

  const keepIndexes: number[] = [];
  for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
    const duplicateOf = keepIndexes.find((keptColumn) =>
      paddedRows.every((row) => row[columnIndex] === row[keptColumn])
    );
    if (duplicateOf === undefined) {
      keepIndexes.push(columnIndex);
    }
  }

  return paddedRows.map((row) => keepIndexes.map((index) => row[index] ?? ''));
}

function normalizeMarkdownTables(lines: string[]): string[] {
  const normalized: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!isMarkdownTableLine(line)) {
      normalized.push(line);
      continue;
    }

    const block: string[] = [];
    while (index < lines.length && isMarkdownTableLine(lines[index] ?? '')) {
      block.push(lines[index] ?? '');
      index += 1;
    }
    index -= 1;

    const headerLine = block[0];
    const separatorLine = block.find(isMarkdownSeparatorLine);
    const dataLines = block.filter(
      (item, blockIndex) => blockIndex !== 0 && item !== separatorLine
    );

    const headerCells = splitMarkdownRow(headerLine);
    const dataCells = dataLines.map(splitMarkdownRow);
    const dedupedRows = dedupeDuplicateColumns([headerCells, ...dataCells]);
    const [normalizedHeader, ...normalizedBody] = dedupedRows;

    normalized.push(`| ${normalizedHeader.join(' | ')} |`);
    normalized.push(`| ${normalizedHeader.map(() => '---').join(' | ')} |`);
    for (const row of normalizedBody) {
      normalized.push(`| ${row.join(' | ')} |`);
    }
  }

  return normalized;
}

function dedupeRepeatedLines(lines: string[]): string[] {
  const normalized: string[] = [];
  let previousNonEmpty: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && previousNonEmpty === trimmed) {
      continue;
    }
    normalized.push(line);
    if (trimmed) previousNonEmpty = trimmed;
  }

  return normalized;
}

export function normalizeDoclingMarkdown(markdown: string): string {
  const normalizedText = collapseBlankLines(fixBrokenTokens(normalizeSpacing(markdown)));
  const lines = normalizedText.split('\n');
  const normalizedLines = normalizeMarkdownTables(normalizeHeadings(dedupeRepeatedLines(lines)));
  return collapseBlankLines(normalizedLines.join('\n')).trim();
}
