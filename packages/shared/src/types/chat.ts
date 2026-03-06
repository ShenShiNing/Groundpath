// Message roles
export const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

// Citation from RAG search
export interface Citation {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  pageNumber?: number;
  score?: number;
}

// Token usage stats
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Message metadata
export interface MessageMetadata {
  citations?: Citation[];
  tokenUsage?: TokenUsage;
  agentTrace?: AgentStep[];
}

// Chat message (API response)
export interface MessageInfo {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata: MessageMetadata | null;
  createdAt: Date;
}

// Conversation (API response)
export interface ConversationInfo {
  id: string;
  userId: string;
  knowledgeBaseId: string | null;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

// Conversation with messages
export interface ConversationWithMessages extends ConversationInfo {
  messages: MessageInfo[];
}

// List item for conversation sidebar
export interface ConversationListItem {
  id: string;
  title: string;
  knowledgeBaseId: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
}

export interface ConversationSearchItem {
  conversationId: string;
  conversationTitle: string;
  knowledgeBaseId: string | null;
  messageId: string;
  role: MessageRole;
  snippet: string;
  matchedAt: Date;
  score: number | null;
}

export interface ConversationSearchResponse {
  items: ConversationSearchItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

// Create conversation request
export interface CreateConversationRequest {
  knowledgeBaseId?: string;
  title?: string;
}

// Update conversation request
export interface UpdateConversationRequest {
  title: string;
}

// Send message request
export interface SendMessageRequest {
  content: string;
  documentIds?: string[]; // Optional scope to specific documents
}

// --- Agent / Tool types ---
export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultInfo {
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
}

export interface AgentStep {
  toolCalls: ToolCallInfo[];
  toolResults: ToolResultInfo[];
  durationMs?: number;
}

// SSE event types for streaming
export type SSEEventType = 'chunk' | 'sources' | 'done' | 'error' | 'tool_start' | 'tool_end';

export interface SSEChunkEvent {
  type: 'chunk';
  data: string;
}

export interface SSESourcesEvent {
  type: 'sources';
  data: Citation[];
}

export interface SSEDoneEvent {
  type: 'done';
  data: {
    messageId: string;
    tokenUsage?: TokenUsage;
  };
}

export interface SSEErrorEvent {
  type: 'error';
  data: {
    code: string;
    message: string;
  };
}

export interface SSEToolStartEvent {
  type: 'tool_start';
  data: { stepIndex: number; toolCalls: ToolCallInfo[] };
}

export interface SSEToolEndEvent {
  type: 'tool_end';
  data: { stepIndex: number; toolResults: ToolResultInfo[]; durationMs: number };
}

export type SSEEvent =
  | SSEChunkEvent
  | SSESourcesEvent
  | SSEDoneEvent
  | SSEErrorEvent
  | SSEToolStartEvent
  | SSEToolEndEvent;

// Error code type
export type ChatErrorCode =
  (typeof import('../constants').CHAT_ERROR_CODES)[keyof typeof import('../constants').CHAT_ERROR_CODES];
