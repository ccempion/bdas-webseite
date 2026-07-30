/**
 * Private test harness for the members module. Not re-exported from index.ts.
 * Pulls in the auth + groups migrations because the members tables FK both.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { createTestDb, type TestDb } from "@bdas/db/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

/** Migration files, in apply order. Append new members migrations here. */
export const MEMBERS_TEST_MIGRATIONS: ReadonlyArray<ReadonlyArray<string>> = [
  ["..", "..", "auth", "migrations", "0001_init.sql"],
  ["..", "..", "groups", "migrations", "0001_init.sql"],
  ["..", "migrations", "0001_init.sql"],
  ["..", "migrations", "0002_role_grants.sql"],
  ["..", "migrations", "0003_local_board_lead.sql"],
  ["..", "migrations", "0004_revoked_by.sql"],
  ["..", "migrations", "0005_event_organizer.sql"],
  ["..", "migrations", "0006_group_change_requests.sql"],
  ["..", "migrations", "0007_page_editor.sql"],
  ["..", "migrations", "0008_application_reasons.sql"],
  ["..", "migrations", "0009_reason_required.sql"],
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

/** Fresh schema with every members migration applied. */
export async function setupMembersDb(): Promise<TestDb> {
  const t = await createTestDb();
  for (const file of MEMBERS_TEST_MIGRATIONS) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
  return t;
}

export async function createUser(t: TestDb, id: string, email: string): Promise<void> {
  await t.client`
    INSERT INTO auth_users (id, email_normalized, email_display, status)
    VALUES (${id}, ${email}, ${email}, 'active')
  `;
}

export async function createGroup(
  t: TestDb,
  id: string,
  slug: string,
  status: "active" | "dormant" | "new" | "archived" = "active",
): Promise<void> {
  await t.client`
    INSERT INTO groups (id, slug, name, city, status)
    VALUES (${id}, ${slug}, ${slug}, 'Teststadt', ${status})
  `;
}
