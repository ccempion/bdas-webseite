/**
 * DB-level checks for the 0002 migration: category default/CHECK, and the
 * post_reports table + its FK cascade. Skips when DATABASE_URL is unreachable.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

async function dbReachable(): Promise<boolean> {
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

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

async function applyMigrations(t: TestDb): Promise<void> {
  for (const file of ["0001_init.sql", "0002_categories_reports_softdelete.sql"]) {
    const sql = await fs.readFile(path.join(__dirname, "..", "migrations", file), "utf8");
    await t.client.unsafe(sql);
  }
}

describeIfDb("blog schema — categories, soft-delete, reports", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
  });

  afterEach(async () => {
    await t.cleanup();
  });

  async function insertPost(id: string, category?: string): Promise<void> {
    if (category) {
      await t.client`
        INSERT INTO posts (id, slug, title, content, created_by, category)
        VALUES (${id}, ${id}, 'Titel', '{"type":"doc"}', 'usr_1', ${category})`;
    } else {
      await t.client`
        INSERT INTO posts (id, slug, title, content, created_by)
        VALUES (${id}, ${id}, 'Titel', '{"type":"doc"}', 'usr_1')`;
    }
  }

  it("defaults category to 'sonstiges' and deleted_at to null", async () => {
    await insertPost("post_1");
    const rows = await t.client`SELECT category, deleted_at FROM posts WHERE id = 'post_1'`;
    expect(rows[0]?.["category"]).toBe("sonstiges");
    expect(rows[0]?.["deleted_at"]).toBeNull();
  });

  it("rejects an invalid category via the CHECK constraint", async () => {
    await expect(insertPost("post_2", "unsinn")).rejects.toThrow();
  });

  it("accepts a post_reports row and cascades on hard post delete", async () => {
    await insertPost("post_3");
    await t.client`
      INSERT INTO post_reports (id, post_id, reporter_id, reason)
      VALUES ('report_1', 'post_3', 'usr_2', 'Spam')`;

    const before = await t.client`SELECT * FROM post_reports WHERE id = 'report_1'`;
    expect(before).toHaveLength(1);

    await t.client`DELETE FROM posts WHERE id = 'post_3'`;

    const after = await t.client`SELECT * FROM post_reports WHERE id = 'report_1'`;
    expect(after).toHaveLength(0);
  });

  it("rejects an invalid post_reports status via the CHECK constraint", async () => {
    await insertPost("post_4");
    await expect(
      t.client`
        INSERT INTO post_reports (id, post_id, reporter_id, status)
        VALUES ('report_2', 'post_4', 'usr_2', 'unsinn')`,
    ).rejects.toThrow();
  });
});
