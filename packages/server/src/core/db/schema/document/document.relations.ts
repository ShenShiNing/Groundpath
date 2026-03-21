import { relations } from 'drizzle-orm';
import { documentChunks } from './document-chunks.schema';
import { documentIndexVersions } from './document-index-versions.schema';
import { documents } from './documents.schema';
import { documentVersions } from './document-versions.schema';
import { knowledgeBases } from './knowledge-bases.schema';
import { users } from '../user/users.schema';

export const knowledgeBasesRelations = relations(knowledgeBases, ({ one, many }) => ({
  user: one(users, {
    fields: [knowledgeBases.userId],
    references: [users.id],
  }),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  knowledgeBase: one(knowledgeBases, {
    fields: [documents.knowledgeBaseId],
    references: [knowledgeBases.id],
  }),
  versions: many(documentVersions),
  chunks: many(documentChunks),
  indexVersions: many(documentIndexVersions),
}));

export const documentVersionsRelations = relations(documentVersions, ({ one }) => ({
  document: one(documents, {
    fields: [documentVersions.documentId],
    references: [documents.id],
  }),
}));

export const documentIndexVersionsRelations = relations(documentIndexVersions, ({ one }) => ({
  document: one(documents, {
    fields: [documentIndexVersions.documentId],
    references: [documents.id],
  }),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
}));
