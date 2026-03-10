import type { ImageClassification } from './image-classifier';

const SYSTEM_PROMPT = `You are a document image analysis assistant. Your task is to produce concise, information-dense text descriptions of images extracted from documents. These descriptions will be indexed for semantic search, so include all key facts, data, labels, and relationships visible in the image. Write in plain text, no markdown formatting. Be factual and specific.`;

const PROMPTS: Record<ImageClassification, string> = {
  chart: `Describe this chart/graph in detail. Include:
- Chart type (bar, line, pie, scatter, etc.)
- Axis labels and units
- Key data points, values, and trends
- Comparisons and notable patterns
- Title and legend items if visible`,

  diagram: `Describe this diagram in detail. Include:
- Type of diagram (flowchart, architecture, topology, etc.)
- All components/nodes and their labels
- Connections, relationships, and data flow direction
- Hierarchy or layers if present
- Any annotations or labels on connections`,

  formula: `Describe this mathematical content. Include:
- The formula/equation in LaTeX notation
- A natural language explanation of what it represents
- Variable definitions if visible
- The context or field it belongs to`,

  table_image: `Extract the content of this table. Include:
- Column headers
- Row labels
- All cell values, preserving the structure
- Any totals, averages, or summary rows
- Units and notable patterns in the data`,

  photo: `Describe this image in detail. Include:
- Main subject(s) and their characteristics
- Scene, setting, or context
- Notable objects, text overlays, or annotations
- Spatial relationships between elements
- Any technical or domain-specific details visible`,

  unknown: `Describe this image in detail. Include:
- What type of image this is
- All visible text, labels, and annotations
- Key elements, objects, or data shown
- Relationships between elements
- Any technical or domain-specific details`,
};

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function getUserPrompt(
  classification: ImageClassification,
  context?: { captionText?: string; sectionTitle?: string; documentTitle?: string }
): string {
  let prompt = PROMPTS[classification];

  const contextParts: string[] = [];
  if (context?.documentTitle) contextParts.push(`Document: "${context.documentTitle}"`);
  if (context?.sectionTitle) contextParts.push(`Section: "${context.sectionTitle}"`);
  if (context?.captionText) contextParts.push(`Caption: "${context.captionText}"`);

  if (contextParts.length > 0) {
    prompt += `\n\nContext:\n${contextParts.join('\n')}`;
  }

  return prompt;
}
