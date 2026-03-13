import type { Response } from 'express';
import type { GenerateOptions, LLMProvider } from '@modules/llm';
import type {
  Citation,
  MessageMetadata,
  ToolCallInfo,
  ToolResultInfo,
} from '@knowledge-agent/shared/types';

export interface SendMessageOptions {
  userId: string;
  conversationId: string;
  content: string;
  documentIds?: string[];
  editedMessageId?: string;
}

export interface EnrichedSearchResult {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  score: number;
  metadata?: {
    pageNumber?: number;
  };
}

export interface AgentExecutionContext {
  conversationId: string;
  content: string;
  userId: string;
  documentIds?: string[];
  knowledgeBaseId: string | null;
  provider: LLMProvider;
  genOptions: GenerateOptions;
  signal?: AbortSignal;
}

export interface AgentExecutionCallbacks {
  onToolStart?: (stepIndex: number, toolCalls: ToolCallInfo[]) => void;
  onToolEnd?: (stepIndex: number, toolResults: ToolResultInfo[], durationMs: number) => void;
}

export interface PersistAssistantMessageInput {
  messageId: string;
  conversationId: string;
  content: string;
  citations?: Citation[];
  retrievedSources?: Citation[];
  agentTrace?: MessageMetadata['agentTrace'];
  stopReason?: MessageMetadata['stopReason'];
}

export interface StreamContext {
  res: Response;
  userId: string;
  conversationId: string;
  content: string;
  documentIds?: string[];
  assistantMessageId: string;
  knowledgeBaseId: string | null;
  provider: LLMProvider;
  genOptions: GenerateOptions;
  abortController: AbortController;
  isDisconnected: () => boolean;
  completionStopReason?: MessageMetadata['stopReason'];
}
