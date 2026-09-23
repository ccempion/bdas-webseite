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
import { files, folders } from "../schema";
import { deleteFilesByMember, exportForUser } from "./gdpr";

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

  describe("deleteFilesByMember", () => {
    it("deletes the storage object and the row for every file the member uploaded", async () => {
      const { memberId, groupId } = await seedMember(t);
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId})`;
      await t.db.insert(files).values({
        id: "fil_1",
        folderId: "fld_1",
        filename: "a.pdf",
        storageKey: "k/a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        uploadedBy: memberId,
      });
      const deletedKeys: string[] = [];
      setStorage(
        fakeStorage({
          deleteObject: async (key: string) => {
            deletedKeys.push(key);
          },
        }),
      );

      await deleteFilesByMember(t.db, "usr_test_1");

      expect(deletedKeys).toEqual(["k/a.pdf"]);
      expect(await t.db.select().from(files).where(eq(files.id, "fil_1"))).toEqual([]);
    });

    it("tolerates a storage object that is already gone", async () => {
      const { memberId, groupId } = await seedMember(t);
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId})`;
      await t.db.insert(files).values({
        id: "fil_1",
        folderId: "fld_1",
        filename: "a.pdf",
        storageKey: "k/a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        uploadedBy: memberId,
      });
      setStorage(
        fakeStorage({
          deleteObject: async () => {
            throw new Error("object not found");
          },
        }),
      );

      await expect(deleteFilesByMember(t.db, "usr_test_1")).resolves.toBeUndefined();
      expect(await t.db.select().from(files).where(eq(files.id, "fil_1"))).toEqual([]);
    });

    it("deletes a folder the member created once removing their files leaves it empty", async () => {
      const { memberId, groupId } = await seedMember(t);
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, depth) VALUES ('fld_root', 'root', 'Root', 'local_board', ${groupId}, 0)`;
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, parent_id, depth) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId}, ${memberId}, 'fld_root', 1)`;
      await t.db.insert(files).values({
        id: "fil_1",
        folderId: "fld_1",
        filename: "a.pdf",
        storageKey: "k/a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        uploadedBy: memberId,
      });

      await deleteFilesByMember(t.db, "usr_test_1");

      expect(await t.db.select().from(folders).where(eq(folders.id, "fld_1"))).toEqual([]);
    });

    it("keeps a folder the member created if another member's file is still inside it", async () => {
      const { memberId, groupId } = await seedMember(t);
      const other = await seedMember(t, { userId: "usr_other", memberId: "mbr_other" });
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, depth) VALUES ('fld_root', 'root', 'Root', 'local_board', ${groupId}, 0)`;
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, parent_id, depth) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId}, ${memberId}, 'fld_root', 1)`;
      await t.db.insert(files).values({
        id: "fil_other",
        folderId: "fld_1",
        filename: "other.pdf",
        storageKey: "k/other.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        uploadedBy: other.memberId,
      });
      // the deleted member's OWN file, in the same shared folder — proves
      // the purge selectively deletes theirs while leaving fil_other alone,
      // not just that nothing happened to the folder
      await t.db.insert(files).values({
        id: "fil_mine",
        folderId: "fld_1",
        filename: "mine.pdf",
        storageKey: "k/mine.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        uploadedBy: memberId,
      });
      // re-wire the resolver back to the member under deletion, since
      // seedMember(t, other) above overwrote it
      setMemberIdResolver({
        async resolveMemberId(_db, uid): Promise<string | null> {
          return uid === "usr_test_1" ? memberId : null;
        },
      });

      await deleteFilesByMember(t.db, "usr_test_1");

      const [folder] = await t.db.select().from(folders).where(eq(folders.id, "fld_1"));
      expect(folder).toBeDefined();
      expect(folder?.createdBy).toBe(memberId);
      expect(await t.db.select().from(files).where(eq(files.id, "fil_mine"))).toEqual([]);
      const [otherFile] = await t.db.select().from(files).where(eq(files.id, "fil_other"));
      expect(otherFile).toBeDefined();
      expect(otherFile?.uploadedBy).toBe(other.memberId);
    });

    it("guards root folders from cleanup even when created_by is set on them (defence in depth)", async () => {
      // ensureFolders never sets created_by on a root in production, but the
      // isNotNull(folders.parentId) guard in deleteFilesByMember exists for
      // when it somehow is. Without that guard, fld_rootguard would become
      // an eligible, empty, member-created candidate the instant fld_rgchild
      // is purged below — this test fails if that guard is removed.
      const { memberId, groupId } = await seedMember(t);
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, parent_id, depth) VALUES ('fld_rootguard', 'rootguard', 'Rootguard', 'local_board', ${groupId}, ${memberId}, NULL, 0)`;
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, parent_id, depth) VALUES ('fld_rgchild', 'rgchild', 'RgChild', 'local_board', ${groupId}, ${memberId}, 'fld_rootguard', 1)`;
      await t.db.insert(files).values({
        id: "fil_rgchild",
        folderId: "fld_rgchild",
        filename: "a.pdf",
        storageKey: "k/rgchild-a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        uploadedBy: memberId,
      });

      await deleteFilesByMember(t.db, "usr_test_1");

      expect(await t.db.select().from(folders).where(eq(folders.id, "fld_rgchild"))).toEqual([]);
      const [root] = await t.db.select().from(folders).where(eq(folders.id, "fld_rootguard"));
      expect(root).toBeDefined();
    });

    it("keeps a member-created folder whose grandchild folder holds another member's file", async () => {
      // fld_nestparent is created BY the member and holds their own file
      // (proving the purge ran); fld_nestmid is a deeper, not-member-created
      // descendant holding a foreign file. The surviving-descendant-chain
      // protection must hold two levels down, not just for a direct child.
      const { memberId, groupId } = await seedMember(t);
      const other = await seedMember(t, { userId: "usr_other2", memberId: "mbr_other2" });
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, depth) VALUES ('fld_nestroot', 'nestroot', 'NestRoot', 'local_board', ${groupId}, 0)`;
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, parent_id, depth) VALUES ('fld_nestparent', 'nestparent', 'NestParent', 'local_board', ${groupId}, ${memberId}, 'fld_nestroot', 1)`;
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, parent_id, depth) VALUES ('fld_nestmid', 'nestmid', 'NestMid', 'local_board', ${groupId}, ${other.memberId}, 'fld_nestparent', 2)`;
      await t.db.insert(files).values({
        id: "fil_nestmine",
        folderId: "fld_nestparent",
        filename: "mine.pdf",
        storageKey: "k/nest-mine.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        uploadedBy: memberId,
      });
      await t.db.insert(files).values({
        id: "fil_nestother",
        folderId: "fld_nestmid",
        filename: "other.pdf",
        storageKey: "k/nest-other.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        uploadedBy: other.memberId,
      });
      // re-wire the resolver back to the member under deletion, since
      // seedMember(t, other) above overwrote it
      setMemberIdResolver({
        async resolveMemberId(_db, uid): Promise<string | null> {
          return uid === "usr_test_1" ? memberId : null;
        },
      });

      await expect(deleteFilesByMember(t.db, "usr_test_1")).resolves.toBeUndefined();

      expect(await t.db.select().from(files).where(eq(files.id, "fil_nestmine"))).toEqual([]);
      const [parent] = await t.db.select().from(folders).where(eq(folders.id, "fld_nestparent"));
      expect(parent).toBeDefined();
      const [mid] = await t.db.select().from(folders).where(eq(folders.id, "fld_nestmid"));
      expect(mid).toBeDefined();
      const [otherFile] = await t.db.select().from(files).where(eq(files.id, "fil_nestother"));
      expect(otherFile).toBeDefined();
    });

    it("deletes a chain of now-empty folders the member created, deepest first, but never the root above them", async () => {
      const { memberId, groupId } = await seedMember(t);
      // fld_root is a REAL root (parent_id null, depth 0, not created by the
      // member) — it must survive regardless of how empty the chain below it
      // gets, matching deleteFolder's D5 invariant (system-provisioned roots
      // are never a delete candidate).
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, depth) VALUES ('fld_root', 'root', 'Root', 'local_board', ${groupId}, 0)`;
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, parent_id, depth) VALUES ('fld_parent', 'p', 'P', 'local_board', ${groupId}, ${memberId}, 'fld_root', 1)`;
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, parent_id, depth) VALUES ('fld_child', 'c', 'C', 'local_board', ${groupId}, ${memberId}, 'fld_parent', 2)`;
      await t.db.insert(files).values({
        id: "fil_1",
        folderId: "fld_child",
        filename: "a.pdf",
        storageKey: "k/a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        uploadedBy: memberId,
      });

      await deleteFilesByMember(t.db, "usr_test_1");

      expect(await t.db.select().from(folders).where(eq(folders.id, "fld_child"))).toEqual([]);
      expect(await t.db.select().from(folders).where(eq(folders.id, "fld_parent"))).toEqual([]);
      const [root] = await t.db.select().from(folders).where(eq(folders.id, "fld_root"));
      expect(root).toBeDefined();
    });

    it("is a no-op when the user has no resolvable member", async () => {
      setMemberIdResolver({
        async resolveMemberId(): Promise<string | null> {
          return null;
        },
      });

      await expect(deleteFilesByMember(t.db, "usr_unknown")).resolves.toBeUndefined();
    });

    it("is idempotent: a second call after everything is gone is a clean no-op", async () => {
      const { memberId, groupId } = await seedMember(t);
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, depth) VALUES ('fld_root', 'root', 'Root', 'local_board', ${groupId}, 0)`;
      await t.client`INSERT INTO folders (id, slug, name, scope, group_id, created_by, parent_id, depth) VALUES ('fld_1', 'a', 'A', 'local_board', ${groupId}, ${memberId}, 'fld_root', 1)`;
      await t.db.insert(files).values({
        id: "fil_1",
        folderId: "fld_1",
        filename: "a.pdf",
        storageKey: "k/a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        status: "ready",
        uploadedBy: memberId,
      });

      await deleteFilesByMember(t.db, "usr_test_1");
      // confirms the first call genuinely deleted the folder, so the second
      // call's no-op is proving idempotency, not just doing nothing twice
      expect(await t.db.select().from(folders).where(eq(folders.id, "fld_1"))).toEqual([]);

      await expect(deleteFilesByMember(t.db, "usr_test_1")).resolves.toBeUndefined();
    });
  });
});
