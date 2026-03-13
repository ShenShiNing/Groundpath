import { documentIndexConfig } from '@config/env';

function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af)
  );
}

export function estimateDocumentTokens(text: string): number {
  if (!text) {
    return 0;
  }

  const asciiCharsPerToken =
    documentIndexConfig.asciiCharsPerToken ?? documentIndexConfig.charsPerToken;
  const cjkCharsPerToken =
    documentIndexConfig.cjkCharsPerToken ?? Math.max(1, asciiCharsPerToken / 2);
  const otherCharsPerToken = documentIndexConfig.charsPerToken;

  let asciiCount = 0;
  let cjkCount = 0;
  let otherCount = 0;

  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }

    if (codePoint <= 0x7f) {
      asciiCount++;
      continue;
    }

    if (isCjkCodePoint(codePoint)) {
      cjkCount++;
      continue;
    }

    otherCount++;
  }

  const estimated =
    asciiCount / asciiCharsPerToken + cjkCount / cjkCharsPerToken + otherCount / otherCharsPerToken;

  return Math.max(1, Math.ceil(estimated));
}
