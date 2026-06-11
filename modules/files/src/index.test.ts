/**
 * Files integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 *
 * Applies auth + groups + members + files migrations (the files FK chain).
 * A fake StorageClient is injected per-test so no real bucket is touched.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";
import { setStorage, type SignedUrl, type StorageClient } from "@bdas/storage";

import { fileAccessLog, files, folders } from "./schema";

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

/** Apply the FK chain the files tables depend on, in manifest order. */
async function applyMigrations(t: TestDb): Promise<void> {
  for (const file of [
    ["..", "..", "auth", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0001_init.sql"],
    ["..", "..", "members", "migrations", "0001_init.sql"],
    ["..", "migrations", "0001_init.sql"],
  ]) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
}

/** A fake storage driver whose behavior each test configures. */
function fakeStorage(over: Partial<StorageClient> = {}): StorageClient {
  const url: SignedUrl = { url: "https://signed.example/put", expiresAt: new Date(Date.now() + 3600_000) };
  return {
    signedUploadUrl: async () => url,
    signedDownloadUrl: async () => ({ ...url, url: "https://signed.example/get" }),
    statObject: async () => ({ sizeBytes: 0 }),
    deleteObject: async () => undefined,
    ...over,
  };
}

/** Seed a group + an active member belonging to it. Returns their ids. */
async function seedGroupAndMember(
  t: TestDb,
  opts: { groupId?: string; memberId?: string; userId?: string; status?: string } = {},
): Promise<{ groupId: string; memberId: string }> {
  const groupId = opts.groupId ?? "grp_muc";
  const memberId = opts.memberId ?? "mbr_1";
  const userId = opts.userId ?? "usr_1";
  const status = opts.status ?? "active";
  await t.client`INSERT INTO groups (id, slug, name, city) VALUES (${groupId}, ${groupId}, 'München', 'München') ON CONFLICT DO NOTHING`;
  await t.client`INSERT INTO auth_users (id, email_normalized, email_display, status) VALUES (${userId}, ${userId + "@example.org"}, ${userId + "@example.org"}, 'active')`;
  await t.client`INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status) VALUES (${memberId}, ${userId}, 'Test', 'Member', ${groupId}, ${status})`;
  return { groupId, memberId };
}

describeIfDb("files schema", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
  });

  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("creates the three tables empty", async () => {
    expect(await t.db.select().from(folders)).toEqual([]);
    expect(await t.db.select().from(files)).toEqual([]);
    expect(await t.db.select().from(fileAccessLog)).toEqual([]);
  });

  it("enforces one folder per (scope, group_id)", async () => {
    await seedGroupAndMember(t);
    await t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_a', 'a', 'A', 'local_board', 'grp_muc')`;
    await expect(
      t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_b', 'b', 'B', 'local_board', 'grp_muc')`,
    ).rejects.toThrow();
  });
});
