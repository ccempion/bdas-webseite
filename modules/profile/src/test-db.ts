/**
 * Private test harness for the profile module. Not re-exported from index.ts.
 * Pulls in the auth migrations because `member_profiles.user_id` FKs
 * `auth_users` for GDPR erasure (profile/0002), the same way the members
 * harness pulls in auth + groups.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { createTestDb, type TestDb } from "@bdas/db/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

/** Migration files, in apply order. Append new profile migrations here. */
export const PROFILE_TEST_MIGRATIONS: ReadonlyArray<ReadonlyArray<string>> = [
  ["..", "..", "auth", "migrations", "0001_init.sql"],
  ["..", "migrations", "0001_init.sql"],
  ["..", "migrations", "0002_user_fk.sql"],
];

export async function dbReachable(): Promise<boolean> {
  const url = process.env["DATABASE_URL"] ?? DEFAULT_URL;
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 2 });
  try {
    await sql`select 1`;
    await sql.end();
    return true;
  } catch {
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

/** Fresh schema with every profile migration applied. */
export async function setupProfileDb(): Promise<TestDb> {
  const t = await createTestDb();
  for (const file of PROFILE_TEST_MIGRATIONS) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
  return t;
}

/**
 * Insert the identity a profile hangs off. Required since profile/0002: the
 * `user_id` FK rejects a profile for a user that does not exist.
 */
export async function seedAuthUser(t: TestDb, userId: string): Promise<void> {
  await t.client`
    INSERT INTO auth_users (id, email_normalized, email_display, status)
    VALUES (${userId}, ${`${userId}@test.local`}, ${`${userId}@test.local`}, 'active')`;
}
