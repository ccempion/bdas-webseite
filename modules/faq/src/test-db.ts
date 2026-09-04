/**
 * Private test harness for the faq module. Not re-exported from index.ts.
 * `faq_*` have no cross-module FKs — only this module's migrations run.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { createTestDb, type TestDb } from "@bdas/db/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

/**
 * Schema migrations, in apply order. Append new faq migrations here.
 *
 * `0002_seed.sql` is deliberately NOT in this list: it inserts 30 entries and
 * 5 topics, and every service test assumes empty tables. Opt into it per test
 * with `setupFaqDb({ seed: true })` / `applyFaqSeed`.
 */
export const FAQ_TEST_MIGRATIONS: ReadonlyArray<ReadonlyArray<string>> = [
  ["..", "migrations", "0001_init.sql"],
];

const SEED_MIGRATION = ["..", "migrations", "0002_seed.sql"];

/** Applies `0002_seed.sql` to an already-migrated test schema. */
export async function applyFaqSeed(t: TestDb): Promise<void> {
  const sql = await fs.readFile(path.join(__dirname, ...SEED_MIGRATION), "utf8");
  await t.client.unsafe(sql);
}

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

/**
 * Fresh schema with every faq schema migration applied — and, only when asked
 * for explicitly, the content seed on top.
 */
export async function setupFaqDb(opts?: { seed?: boolean }): Promise<TestDb> {
  const t = await createTestDb();
  for (const file of FAQ_TEST_MIGRATIONS) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
  if (opts?.seed) await applyFaqSeed(t);
  return t;
}
