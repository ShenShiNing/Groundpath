import type { Conversation } from '@core/db/schema/ai/conversations.schema';
import type { Document } from '@core/db/schema/document/documents.schema';
import type { KnowledgeBase } from '@core/db/schema/document/knowledge-bases.schema';

export interface OwnedResources {
  conversation?: Conversation;
  document?: Document;
  knowledgeBase?: KnowledgeBase;
}

export type OwnedResourceKey = keyof OwnedResources;
