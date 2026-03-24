/**
 * Document AI Types
 * Types for document summarization, analysis, and generation features
 */

// ============================================================================
// Summary Types
// ============================================================================

/** Summary length options */
export type SummaryLength = 'short' | 'medium' | 'detailed';

/** Summary request */
export interface SummaryRequest {
  length?: SummaryLength;
  language?: string;
  focusAreas?: string[];
}

/** Summary response (non-streaming) */
export interface SummaryResponse {
  summary: string;
  wordCount: number;
  language: string;
  generatedAt: string;
}

// ============================================================================
// Analysis Types
// ============================================================================

/** Analysis type options */
export type AnalysisType = 'keywords' | 'entities' | 'topics' | 'structure';

/** Entity type categories */
export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'date'
  | 'product'
  | 'event'
  | 'other';

/** Keyword with relevance score */
export interface Keyword {
  word: string;
  relevance: number;
  frequency?: number;
}

/** Named entity extracted from document */
export interface Entity {
  text: string;
  type: EntityType;
  confidence: number;
  occurrences?: number;
}

/** Topic identified in document */
export interface Topic {
  name: string;
  description: string;
  confidence: number;
}

/** Document structure information */
export interface DocumentStructure {
  characterCount: number;
  wordCount: number;
  paragraphCount: number;
  sentenceCount: number;
  estimatedReadingTimeMinutes: number;
  headings: StructureHeading[];
}

/** Heading in document structure */
export interface StructureHeading {
  level: number;
  text: string;
  position: number;
}

/** Analysis request */
export interface AnalysisRequest {
  analysisTypes?: AnalysisType[];
  maxKeywords?: number;
  maxEntities?: number;
  maxTopics?: number;
}

/** Analysis response */
export interface AnalysisResponse {
  documentId: string;
  keywords?: Keyword[];
  entities?: Entity[];
  topics?: Topic[];
  structure?: DocumentStructure;
  analyzedAt: string;
}

/** Keywords extraction request */
export interface ExtractKeywordsRequest {
  maxKeywords?: number;
  language?: string;
}

/** Entities extraction request */
export interface ExtractEntitiesRequest {
  maxEntities?: number;
  language?: string;
}

/** Keywords-only response */
export interface KeywordsResponse {
  keywords: Keyword[];
}

/** Entities-only response */
export interface EntitiesResponse {
  entities: Entity[];
}

/** Structure-only response */
export interface StructureResponse {
  structure: DocumentStructure;
}

// ============================================================================
// Generation Types
// ============================================================================

/** Generation template types */
export type GenerationTemplate = 'report' | 'email' | 'article' | 'outline' | 'summary' | 'custom';

/** Generation style options */
export type GenerationStyle = 'formal' | 'casual' | 'technical' | 'creative' | 'academic';

/** Generation request */
export interface GenerationRequest {
  prompt: string;
  template?: GenerationTemplate;
  style?: GenerationStyle;
  language?: string;
  maxLength?: number;
  /** Optional knowledge base ID for RAG-enhanced generation */
  knowledgeBaseId?: string;
  /** Optional context from existing documents */
  contextDocumentIds?: string[];
}

/** Generation response (non-streaming) */
export interface GenerationResponse {
  content: string;
  wordCount: number;
  template?: GenerationTemplate;
  style?: GenerationStyle;
  generatedAt: string;
}

/** Expand request - extends existing document */
export interface ExpandRequest {
  instruction: string;
  position?: 'before' | 'after' | 'replace';
  style?: GenerationStyle;
  maxLength?: number;
  /** Optional knowledge base for RAG-enhanced expansion */
  knowledgeBaseId?: string;
}

/** Expand response */
export interface ExpandResponse {
  content: string;
  wordCount: number;
  position: 'before' | 'after' | 'replace';
  generatedAt: string;
}

// ============================================================================
// SSE Event Types
// ============================================================================

/** SSE event types for document AI streaming */
export type DocumentAISSEEventType = 'chunk' | 'done' | 'error' | 'heartbeat';

/** SSE event for document AI streaming */
export interface DocumentAISSEEvent {
  type: DocumentAISSEEventType;
  data: string | DocumentAIStreamDone | DocumentAIStreamError | DocumentAIStreamHeartbeat;
}

/** Stream completion data */
export interface DocumentAIStreamDone {
  wordCount: number;
  generatedAt: string;
}

/** Stream error data */
export interface DocumentAIStreamError {
  code: string;
  message: string;
}

/** Stream heartbeat data */
export interface DocumentAIStreamHeartbeat {
  timestamp: number;
}

// ============================================================================
// Error Code Type
// ============================================================================

export type DocumentAIErrorCode =
  | 'DOCUMENT_AI_CONTENT_EMPTY'
  | 'DOCUMENT_AI_CONTENT_TOO_LARGE'
  | 'DOCUMENT_AI_SUMMARY_FAILED'
  | 'DOCUMENT_AI_ANALYSIS_FAILED'
  | 'DOCUMENT_AI_GENERATION_FAILED'
  | 'DOCUMENT_AI_STREAMING_FAILED';
