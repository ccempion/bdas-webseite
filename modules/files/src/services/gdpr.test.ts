/**
 * Integration tests for this module's GDPR functions (exportForUser,
 * deleteFilesByMember) against a real Postgres schema. Skips when
 * DATABASE_URL is unreachable, matching index.test.ts.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { setStorage, type SignedUrl, type StorageClient } from "@bdas/storage";

import { setMemberIdResolver } from "../resolver";
import { files } from "../schema";
import { exportForUser } from "./gdpr";

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

/** A fake storage driver whose behavior each test configures. */
function fakeStorage(over: Partial<StorageClient> = {}): StorageClient {
  const url: SignedUrl = {
    url: "https://signed.example/put",
    expiresAt: new Date(Date.now() + 3600_000),
  };
  return {
    signedUploadUrl: async () => url,
    signedDownloadUrl: async () => ({ ...url, url: "https://signed.example/get" }),
    statObject: async () => ({ sizeBytes: 0 }),
    deleteObject: async () => undefined,
    ...over,
  };
}

async function applyMigrations(t: TestDb): Promise<void> {
  for (const file of [
    ["..", "..", "..", "auth", "migrations", "0001_init.sql"],
    ["..", "..", "..", "groups", "migrations", "0001_init.sql"],
    ["..", "..", "..", "groups", "migrations", "0004_location.sql"],
    ["..", "..", "..", "groups", "migrations", "0005_image_key.sql"],
    ["..", "..", "..", "groups", "migrations", "0007_group_kind.sql"],
    ["..", "..", "..", "groups", "migrations", "0008_group_kind_netzwerk.sql"],
    ["..", "..", "..", "members", "migrations", "0001_init.sql"],
    ["..", "..", "migrations", "0001_init.sql"],
    ["..", "..", "migrations", "0002_rls_lockdown.sql"],
    ["..", "..", "migrations", "0003_folder_nesting.sql"],
    ["..", "..", "migrations", "0004_board_broadcast_scope.sql"],
    ["..", "..", "migrations", "0005_folder_member_grants.sql"],
    ["..", "..", "migrations", "0006_access_log_retention.sql"],
  ]) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
}

/** Seed a group + an active member belonging to it, and wire the resolver
 *  these GDPR functions depend on. */
async function seedMember(
  t: TestDb,
  opts: { userId?: string; memberId?: string; groupId?: string } = {},
): Promise<{ userId: string; memberId: string; groupId: string }> {
  const userId = opts.userId ?? "usr_test_1";
  const memberId = opts.memberId ?? "mbr_test_1";
  const groupId = opts.groupId ?? "grp_muc";
  await t.client`INSERT INTO groups (id, slug, name, city) VALUES (${groupId}, ${groupId}, 'München', 'München') ON CONFLICT DO NOTHING`;
  await t.client`INSERT INTO auth_users (id, email_normalized, email_display, status) VALUES (${userId}, ${userId + "@example.org"}, ${userId + "@example.org"}, 'active')`;
  await t.client`INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status) VALUES (${memberId}, ${userId}, 'Test', 'Member', ${groupId}, 'active')`;
  setMemberIdResolver({
    async resolveMemberId(_db, uid): Promise<string | null> {
      return uid === userId ? memberId : null;
    },
  });
  return { userId, memberId, groupId };
}

describeIfDb("files GDPR functions", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
  });

  afterEach(async () => {
    await t.cleanup();
  });

  describe("exportForUser", () => {
    it("returns metadata for every file the resolved member uploaded", async () => {
      const { memberId, groupId } = await seedMember(t);
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId})`;
      await t.db.insert(files).values({
        id: "fil_1",
        folderId: "fld_1",
        filename: "protokoll.pdf",
        storageKey: "k/protokoll.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "ready",
        uploadedBy: memberId,
      });

      const rows = await exportForUser(t.db, "usr_test_1");

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "fil_1",
        folderId: "fld_1",
        filename: "protokoll.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        status: "ready",
      });
      expect(rows[0]?.uploadedAt).toBeInstanceOf(Date);
    });

    it("returns an empty array when the user has no resolvable member", async () => {
      setMemberIdResolver({
        async resolveMemberId(): Promise<string | null> {
          return null;
        },
      });

      expect(await exportForUser(t.db, "usr_unknown")).toEqual([]);
    });
  });
});
