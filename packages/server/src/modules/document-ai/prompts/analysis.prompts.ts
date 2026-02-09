/**
 * Analysis Prompts
 * Prompt templates for document analysis (keywords, entities, topics)
 */

interface AnalysisOptions {
  maxItems?: number;
  language?: string;
}

/**
 * Build keyword extraction prompt
 */
export function buildKeywordExtractionPrompt(options: AnalysisOptions = {}): string {
  const { maxItems = 10, language } = options;
  const isEnglish = language?.toLowerCase().includes('en');

  return isEnglish
    ? `You are a keyword extraction specialist. Extract the most important and relevant keywords from the document.

Instructions:
- Extract up to ${maxItems} keywords
- Focus on terms that best represent the document's main topics
- Include both single words and key phrases
- Prioritize domain-specific and technical terms when relevant
- Exclude common stop words and generic terms

Output format (JSON):
{
  "keywords": [
    { "word": "keyword1", "relevance": 0.95 },
    { "word": "keyword2", "relevance": 0.87 }
  ]
}

Relevance score should be between 0 and 1, where 1 is most relevant.`
    : `你是一个关键词提取专家。请从文档中提取最重要和最相关的关键词。

指导原则：
- 提取最多 ${maxItems} 个关键词
- 重点关注能够代表文档主题的术语
- 包括单词和关键短语
- 优先考虑领域特定和技术术语
- 排除常见的停用词和通用词汇

输出格式（JSON）：
{
  "keywords": [
    { "word": "关键词1", "relevance": 0.95 },
    { "word": "关键词2", "relevance": 0.87 }
  ]
}

相关性分数在 0 到 1 之间，1 表示最相关。`;
}

/**
 * Build entity extraction prompt
 */
export function buildEntityExtractionPrompt(options: AnalysisOptions = {}): string {
  const { maxItems = 20, language } = options;
  const isEnglish = language?.toLowerCase().includes('en');

  return isEnglish
    ? `You are a named entity recognition specialist. Extract named entities from the document.

Instructions:
- Extract up to ${maxItems} entities
- Identify entities of these types: person, organization, location, date, product, event, other
- Include confidence scores for each entity
- Count occurrences when possible

Output format (JSON):
{
  "entities": [
    { "text": "Entity Name", "type": "person", "confidence": 0.95, "occurrences": 3 },
    { "text": "Company Inc", "type": "organization", "confidence": 0.88, "occurrences": 2 }
  ]
}

Entity types: person, organization, location, date, product, event, other
Confidence should be between 0 and 1.`
    : `你是一个命名实体识别专家。请从文档中提取命名实体。

指导原则：
- 提取最多 ${maxItems} 个实体
- 识别以下类型的实体：人物(person)、组织(organization)、地点(location)、日期(date)、产品(product)、事件(event)、其他(other)
- 为每个实体提供置信度分数
- 尽可能统计出现次数

输出格式（JSON）：
{
  "entities": [
    { "text": "实体名称", "type": "person", "confidence": 0.95, "occurrences": 3 },
    { "text": "某公司", "type": "organization", "confidence": 0.88, "occurrences": 2 }
  ]
}

实体类型：person, organization, location, date, product, event, other
置信度在 0 到 1 之间。`;
}

/**
 * Build topic identification prompt
 */
export function buildTopicIdentificationPrompt(options: AnalysisOptions = {}): string {
  const { maxItems = 5, language } = options;
  const isEnglish = language?.toLowerCase().includes('en');

  return isEnglish
    ? `You are a topic modeling specialist. Identify the main topics discussed in the document.

Instructions:
- Identify up to ${maxItems} main topics
- Provide a clear, concise name for each topic
- Include a brief description explaining what the topic covers
- Assign confidence scores based on how prominently the topic appears

Output format (JSON):
{
  "topics": [
    { "name": "Topic Name", "description": "Brief description of the topic", "confidence": 0.95 },
    { "name": "Another Topic", "description": "What this topic covers", "confidence": 0.78 }
  ]
}

Confidence should be between 0 and 1.`
    : `你是一个主题建模专家。请识别文档中讨论的主要主题。

指导原则：
- 识别最多 ${maxItems} 个主要主题
- 为每个主题提供清晰简洁的名称
- 包含简短描述解释该主题涵盖的内容
- 根据主题出现的突出程度分配置信度分数

输出格式（JSON）：
{
  "topics": [
    { "name": "主题名称", "description": "主题的简短描述", "confidence": 0.95 },
    { "name": "另一个主题", "description": "该主题涵盖的内容", "confidence": 0.78 }
  ]
}

置信度在 0 到 1 之间。`;
}

/**
 * Build user prompt for analysis with document content
 */
export function buildAnalysisUserPrompt(
  content: string,
  analysisType: string,
  language?: string
): string {
  const isEnglish = language?.toLowerCase().includes('en');

  const typeLabels: Record<string, { en: string; zh: string }> = {
    keywords: { en: 'keywords', zh: '关键词' },
    entities: { en: 'named entities', zh: '命名实体' },
    topics: { en: 'main topics', zh: '主要主题' },
  };

  const label = typeLabels[analysisType] || { en: analysisType, zh: analysisType };

  return isEnglish
    ? `Please extract ${label.en} from the following document. Respond only with valid JSON.\n\n---\n${content}\n---`
    : `请从以下文档中提取${label.zh}。仅以有效的 JSON 格式响应。\n\n---\n${content}\n---`;
}
