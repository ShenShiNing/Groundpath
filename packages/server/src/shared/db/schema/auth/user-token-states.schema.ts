import {
  mysqlTable,
  varchar,
  timestamp,
  foreignKey,
  index,
} from 'drizzle-orm/mysql-core';
import { users } from '../user/users.schema';

export const userTokenStates = mysqlTable(
  'user_token_states',
  {
    userId: varchar('user_id', { length: 36 }).primaryKey(),
    tokenValidAfter: timestamp('token_valid_after').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_token_states_user_id_fk',
    }).onDelete('cascade'),
    index('user_token_states_valid_after_idx').on(table.tokenValidAfter),
  ]
);

export type UserTokenState = typeof userTokenStates.$inferSelect;
