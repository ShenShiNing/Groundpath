import type {
  AgentStopReason,
  Citation as APICitation,
  ToolCallInfo,
  ToolResultInfo,
  AgentStep,
} from '@knowledge-agent/shared/types';

// ============================================================================
// Types
// ============================================================================

export type Citation = APICitation & {
  id: string;
};

export interface ToolStep {
  stepIndex: number;
  toolCalls: ToolCallInfo[];
  toolResults?: ToolResultInfo[];
  durationMs?: number;
  status: 'running' | 'completed';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: Citation[];
  retrievedSources?: Citation[];
  stopReason?: AgentStopReason;
  isLoading?: boolean;
  toolSteps?: ToolStep[];
}

export interface ChatPanelState {
  isOpen: boolean;
  knowledgeBaseId: string | null;
  conversationId: string | null;
  focusMessageId: string | null;
  focusKeyword: string | null;
  messages: ChatMessage[];
  selectedDocumentIds: string[];
  isLoading: boolean;
  abortController: AbortController | null;
  showSidebar: boolean;

  // Actions
  open: (kbId?: string | null) => void;
  close: () => void;
  toggle: () => void;
  sendMessage: (content: string, getAccessToken: () => string | null) => Promise<void>;
  retryMessage: (messageId: string, getAccessToken: () => string | null) => Promise<void>;
  stopGeneration: () => void;
  setDocumentScope: (ids: string[]) => void;
  clearMessages: () => void;
  loadConversation: (conversationId: string) => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (update: Partial<ChatMessage>) => void;
  appendToLastMessage: (text: string) => void;
  addToolStep: (step: ToolStep) => void;
  updateToolStep: (stepIndex: number, update: Partial<ToolStep>) => void;

  // Sidebar actions
  toggleSidebar: () => void;
  startNewConversation: () => void;
  switchKnowledgeBase: (newKbId: string | null) => void;
  switchConversation: (
    conversationId: string,
    options?: { focusMessageId?: string | null; focusKeyword?: string | null }
  ) => Promise<void>;
  clearFocusMessageId: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

export function getCitationPreviewText(citation: Pick<Citation, 'excerpt' | 'content'>): string {
  return citation.excerpt ?? citation.content ?? '';
}

export function getCitationPageLabel(
  citation: Pick<Citation, 'pageStart' | 'pageEnd' | 'pageNumber'>
): string | null {
  if (citation.pageStart && citation.pageEnd) {
    return citation.pageStart === citation.pageEnd
      ? `p.${citation.pageStart}`
      : `p.${citation.pageStart}-${citation.pageEnd}`;
  }

  if (citation.pageStart) {
    return `p.${citation.pageStart}`;
  }

  if (citation.pageEnd) {
    return `p.${citation.pageEnd}`;
  }

  if (citation.pageNumber) {
    return `p.${citation.pageNumber}`;
  }

  return null;
}

export function getCitationLocatorText(
  citation: Pick<Citation, 'locator' | 'sectionPath'>
): string | null {
  if (citation.locator) return citation.locator;
  if (citation.sectionPath?.length) return citation.sectionPath.join(' / ');
  return null;
}

export function toStoreCitation(citation: APICitation, index: number): Citation {
  if (citation.sourceType === 'node') {
    return {
      id: `cit-${index}`,
      ...citation,
      excerpt: citation.excerpt ?? citation.content ?? '',
    };
  }

  return {
    id: `cit-${index}`,
    ...citation,
    excerpt: citation.excerpt ?? citation.content,
  };
}

export function toStopReasonLabelKey(
  stopReason?: AgentStopReason
): `message.stopReason.${string}` | null {
  if (!stopReason || stopReason === 'answered') return null;

  switch (stopReason) {
    case 'budget_exhausted':
      return 'message.stopReason.budgetExhausted';
    case 'insufficient_evidence':
      return 'message.stopReason.insufficientEvidence';
    case 'tool_timeout':
      return 'message.stopReason.toolTimeout';
    case 'user_aborted':
      return 'message.stopReason.userAborted';
    case 'provider_error':
      return 'message.stopReason.providerError';
    default:
      return null;
  }
}

export function agentTraceToToolSteps(trace?: AgentStep[]): ToolStep[] | undefined {
  if (!trace?.length) return undefined;
  return trace.map((step, idx) => ({
    stepIndex: idx,
    toolCalls: step.toolCalls,
    toolResults: step.toolResults,
    durationMs: step.durationMs,
    status: 'completed' as const,
  }));
}
