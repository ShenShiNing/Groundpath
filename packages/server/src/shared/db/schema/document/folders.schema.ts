import { mysqlTable, varchar, timestamp, index } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from '../user/users.schema';
import { documents } from './documents.schema';

export const folders = mysqlTable(
  'folders',
  {
    id: varchar('id', { length: 36 }).primaryKey(), // UUID

    // Ownership
    userId: varchar('user_id', { length: 36 }).notNull(),

    // Folder structure
    parentId: varchar('parent_id', { length: 36 }),
    name: varchar('name', { length: 100 }).notNull(),
    path: varchar('path', { length: 768 }).notNull().default('/'),

    // Audit fields
    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedBy: varchar('updated_by', { length: 36 }),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
    deletedBy: varchar('deleted_by', { length: 36 }),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('user_id_idx').on(table.userId),
    index('parent_id_idx').on(table.parentId),
    index('deleted_at_idx').on(table.deletedAt),
    index('path_idx').on(table.path),
  ]
);

// ==================== Relations ====================
export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: 'parentChild',
  }),
  children: many(folders, {
    relationName: 'parentChild',
  }),
  documents: many(documents),
}));

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
