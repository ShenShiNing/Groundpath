export type ImageClassification =
  | 'chart'
  | 'diagram'
  | 'formula'
  | 'table_image'
  | 'photo'
  | 'unknown';

const CHART_KEYWORDS =
  /\b(chart|graph|histogram|pie\s*chart|bar\s*chart|line\s*chart|scatter|trend|axis|x-axis|y-axis|distribution|percentage|growth|decline|plot)\b/i;
const DIAGRAM_KEYWORDS =
  /\b(diagram|architecture|flow\s*chart|flowchart|topology|pipeline|workflow|process\s*flow|state\s*machine|sequence|block\s*diagram|network|hierarchy|tree)\b/i;
const FORMULA_KEYWORDS =
  /\b(equation|formula|theorem|proof|lemma|corollary|mathematical|integral|derivative|sum|product|matrix)\b/i;
const TABLE_KEYWORDS = /\b(table|row|column|cell|grid|spreadsheet|tabular|comparison\s*table)\b/i;

export function classifyImageByContext(context: {
  captionText?: string;
  sectionTitle?: string;
}): ImageClassification {
  const text = [context.captionText, context.sectionTitle].filter(Boolean).join(' ');
  if (!text) return 'unknown';

  if (CHART_KEYWORDS.test(text)) return 'chart';
  if (DIAGRAM_KEYWORDS.test(text)) return 'diagram';
  if (FORMULA_KEYWORDS.test(text)) return 'formula';
  if (TABLE_KEYWORDS.test(text)) return 'table_image';

  return 'unknown';
}
