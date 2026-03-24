import { sql } from 'drizzle-orm';
import { db } from '@core/db';
import type { CheckResult } from './types';

function extractRows<T>(result: unknown): T[] {
  return (result as [T[]])[0] ?? [];
}

export async function checkOrphanUserAuths(): Promise<CheckResult> {
  const name = '15. Orphan user_auths (missing user)';
  const rows = await db.execute(sql`
    SELECT
      ua.id,
      ua.user_id,
      ua.auth_type,
      ua.auth_id
    FROM user_auths ua
    LEFT JOIN users u ON u.id = ua.user_id
    WHERE u.id IS NULL
    LIMIT 100
  `);

  const results = extractRows<{
    id: string;
    user_id: string;
    auth_type: string;
    auth_id: string;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) => `auth=${row.id} user=${row.user_id} type=${row.auth_type} authId=${row.auth_id}`
    ),
  };
}

export async function checkDuplicateActiveUserEmails(): Promise<CheckResult> {
  const name = '13. Duplicate active user emails';
  const rows = await db.execute(sql`
    SELECT
      email,
      COUNT(*) AS cnt,
      GROUP_CONCAT(id ORDER BY created_at SEPARATOR ',') AS user_ids
    FROM users
    WHERE deleted_at IS NULL
    GROUP BY email
    HAVING COUNT(*) > 1
    LIMIT 100
  `);

  const results = extractRows<{
    email: string;
    cnt: number;
    user_ids: string;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map((row) => `email=${row.email} count=${row.cnt} users=${row.user_ids}`),
  };
}

export async function checkDuplicateActiveUsernames(): Promise<CheckResult> {
  const name = '14. Duplicate active usernames';
  const rows = await db.execute(sql`
    SELECT
      username,
      COUNT(*) AS cnt,
      GROUP_CONCAT(id ORDER BY created_at SEPARATOR ',') AS user_ids
    FROM users
    WHERE deleted_at IS NULL
    GROUP BY username
    HAVING COUNT(*) > 1
    LIMIT 100
  `);

  const results = extractRows<{
    username: string;
    cnt: number;
    user_ids: string;
  }>(rows);

  return {
    name,
    passed: results.length === 0,
    count: results.length,
    details: results.map(
      (row) => `username=${row.username} count=${row.cnt} users=${row.user_ids}`
    ),
  };
}
