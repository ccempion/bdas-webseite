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
import { getEventBus, resetEventBus } from "@bdas/events";
import type { GroupCreated } from "@bdas/groups";
import type { CurrentMember, Grant } from "@bdas/members";
import { setStorage, type SignedUrl, type StorageClient } from "@bdas/storage";

import { fileAccessLog, files, folders } from "./schema";
import {
  confirmUpload,
  deleteFile,
  getDownloadUrl,
  listFiles,
  requestUpload,
  sweepStalePendingUploads,
} from "./services/files";
import { ensureFolders, listFolders } from "./services/folders";
import { registerFilesSubscribers, unregisterFilesSubscribers } from "./subscribers";

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

function meWith(grants: Grant[], member: CurrentMember["member"]): CurrentMember {
  return {
    user: { id: "usr_1", email: "t@x.org", status: "active", roles: [], sessionId: "ses_1" },
    member,
    grants,
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

describeIfDb("ensureFolders / listFolders", () => {
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

  it("provisions the two singletons + two folders per group, idempotently", async () => {
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await t.client`INSERT INTO groups (id, slug, name, city) VALUES ('grp_ber', 'ber', 'Berlin', 'Berlin')`;

    await ensureFolders(t.db);
    await ensureFolders(t.db); // second run must not duplicate

    const rows = await t.db.select().from(folders);
    // 2 singletons + 2 groups × 2 = 6
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.scope === "members_all")).toHaveLength(1);
    expect(rows.filter((r) => r.scope === "federal_board")).toHaveLength(1);
    expect(rows.filter((r) => r.scope === "group_members")).toHaveLength(2);
    expect(rows.filter((r) => r.scope === "local_board")).toHaveLength(2);
  });

  it("listFolders returns only folders the member can read", async () => {
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await t.client`INSERT INTO groups (id, slug, name, city) VALUES ('grp_ber', 'ber', 'Berlin', 'Berlin')`;
    await ensureFolders(t.db);

    const plainMucMember = meWith([{ role: "member", groupId: null }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const visible = await listFolders(t.db, plainMucMember);
    const scopes = visible.map((f) => `${f.scope}:${f.groupId ?? ""}`).sort();
    // members_all + own group_members only; no board/federal/other-group folders
    expect(scopes).toEqual(["group_members:grp_muc", "members_all:"]);
  });
});

describeIfDb("two-phase upload", () => {
  let t: TestDb;
  const boardMe = () =>
    meWith([{ role: "local_board", groupId: "grp_muc" }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  async function localBoardFolderId(): Promise<string> {
    const rows = await t.db.select().from(folders);
    return rows.find((f) => f.scope === "local_board" && f.groupId === "grp_muc")!.id;
  }

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await ensureFolders(t.db);
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("requestUpload inserts a pending row and returns an upload URL", async () => {
    const folderId = await localBoardFolderId();
    const { fileId, uploadUrl } = await requestUpload(
      t.db,
      folderId,
      { filename: "satzung.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
      boardMe(),
    );
    expect(uploadUrl.url).toContain("https://signed.example/put");
    const rows = await t.db.select().from(files);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fileId);
    expect(rows[0]?.status).toBe("pending");
  });

  it("requestUpload rejects a disallowed MIME type", async () => {
    const folderId = await localBoardFolderId();
    await expect(
      requestUpload(
        t.db,
        folderId,
        { filename: "x.exe", mimeType: "application/x-msdownload", sizeBytes: 10 },
        boardMe(),
      ),
    ).rejects.toThrow();
    expect(await t.db.select().from(files)).toHaveLength(0);
  });

  it("requestUpload rejects an over-cap declared size", async () => {
    const folderId = await localBoardFolderId();
    await expect(
      requestUpload(
        t.db,
        folderId,
        { filename: "big.pdf", mimeType: "application/pdf", sizeBytes: 26 * 1024 * 1024 },
        boardMe(),
      ),
    ).rejects.toThrow();
  });

  it("requestUpload denies a member who cannot write the folder", async () => {
    const folderId = await localBoardFolderId();
    const plain = meWith([{ role: "member", groupId: null }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(
      requestUpload(
        t.db,
        folderId,
        { filename: "x.pdf", mimeType: "application/pdf", sizeBytes: 10 },
        plain,
      ),
    ).rejects.toThrow();
  });

  it("confirmUpload promotes to ready when the real size is within cap", async () => {
    const folderId = await localBoardFolderId();
    setStorage(fakeStorage({ statObject: async () => ({ sizeBytes: 1000 }) }));
    const { fileId } = await requestUpload(
      t.db,
      folderId,
      { filename: "satzung.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
      boardMe(),
    );
    const meta = await confirmUpload(t.db, fileId, boardMe());
    expect(meta.status).toBe("ready");
    expect(meta.sizeBytes).toBe(1000);
    const log = await t.db.select().from(fileAccessLog);
    expect(log).toHaveLength(1);
    expect(log[0]?.action).toBe("upload");
  });

  it("confirmUpload rolls back when the real object exceeds the cap", async () => {
    const folderId = await localBoardFolderId();
    let removed: string | null = null;
    setStorage(
      fakeStorage({
        statObject: async () => ({ sizeBytes: 26 * 1024 * 1024 }),
        deleteObject: async (k) => {
          removed = k;
        },
      }),
    );
    const { fileId } = await requestUpload(
      t.db,
      folderId,
      { filename: "lie.pdf", mimeType: "application/pdf", sizeBytes: 1000 },
      boardMe(),
    );
    await expect(confirmUpload(t.db, fileId, boardMe())).rejects.toThrow();
    expect(removed).not.toBeNull();
    expect(await t.db.select().from(files)).toHaveLength(0);
  });
});

describeIfDb("listFiles / getDownloadUrl / deleteFile", () => {
  let t: TestDb;
  const boardMe = () =>
    meWith([{ role: "local_board", groupId: "grp_muc" }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  async function localBoardFolderId(): Promise<string> {
    const rows = await t.db.select().from(folders);
    return rows.find((f) => f.scope === "local_board" && f.groupId === "grp_muc")!.id;
  }
  async function makeReadyFile(): Promise<string> {
    const folderId = await localBoardFolderId();
    setStorage(fakeStorage({ statObject: async () => ({ sizeBytes: 500 }) }));
    const { fileId } = await requestUpload(
      t.db,
      folderId,
      { filename: "doc.pdf", mimeType: "application/pdf", sizeBytes: 500 },
      boardMe(),
    );
    await confirmUpload(t.db, fileId, boardMe());
    return fileId;
  }

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await ensureFolders(t.db);
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("listFiles returns only ready files and is read-gated", async () => {
    await makeReadyFile();
    const folderId = await localBoardFolderId();
    // a pending file in the same folder must not appear
    await requestUpload(
      t.db,
      folderId,
      { filename: "draft.pdf", mimeType: "application/pdf", sizeBytes: 10 },
      boardMe(),
    );

    const listed = await listFiles(t.db, folderId, boardMe());
    expect(listed).toHaveLength(1);
    expect(listed[0]?.filename).toBe("doc.pdf");
  });

  it("getDownloadUrl returns a URL and writes a 'download' log row", async () => {
    const fileId = await makeReadyFile();
    const url = await getDownloadUrl(t.db, fileId, boardMe());
    expect(url.url).toContain("https://signed.example/get");
    const log = await t.db.select().from(fileAccessLog);
    expect(log.filter((r) => r.action === "download")).toHaveLength(1);
  });

  it("deleteFile removes the row + object and logs 'delete'", async () => {
    const fileId = await makeReadyFile();
    let removed: string | null = null;
    setStorage(
      fakeStorage({
        statObject: async () => ({ sizeBytes: 500 }),
        deleteObject: async (k) => {
          removed = k;
        },
      }),
    );

    await deleteFile(t.db, fileId, boardMe());
    expect(removed).not.toBeNull();
    expect(await t.db.select().from(files)).toHaveLength(0);
    // delete log survives; its file_id is nulled by ON DELETE SET NULL
    const del = (await t.db.select().from(fileAccessLog)).filter((r) => r.action === "delete");
    expect(del).toHaveLength(1);
    expect(del[0]?.fileId).toBeNull();
  });

  it("getDownloadUrl denies a member without read access", async () => {
    const fileId = await makeReadyFile();
    const plain = meWith([{ role: "member", groupId: null }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(getDownloadUrl(t.db, fileId, plain)).rejects.toThrow();
  });
});

describeIfDb("sweepStalePendingUploads", () => {
  let t: TestDb;
  const boardMe = () =>
    meWith([{ role: "local_board", groupId: "grp_muc" }], {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "T",
      lastName: "M",
      primaryGroupId: "grp_muc",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  async function localBoardFolderId(): Promise<string> {
    const rows = await t.db.select().from(folders);
    return rows.find((f) => f.scope === "local_board" && f.groupId === "grp_muc")!.id;
  }

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
    await seedGroupAndMember(t, { groupId: "grp_muc", memberId: "mbr_1", userId: "usr_1" });
    await ensureFolders(t.db);
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("deletes pending rows older than the cutoff, keeps recent + ready", async () => {
    const folderId = await localBoardFolderId();
    const removed: string[] = [];
    setStorage(
      fakeStorage({
        statObject: async () => ({ sizeBytes: 5 }),
        deleteObject: async (k) => {
          removed.push(k);
        },
      }),
    );

    // an old pending upload
    const { fileId: oldPending } = await requestUpload(
      t.db,
      folderId,
      { filename: "old.pdf", mimeType: "application/pdf", sizeBytes: 5 },
      boardMe(),
    );
    await t.client`UPDATE files SET uploaded_at = now() - interval '2 days' WHERE id = ${oldPending}`;
    // a fresh pending upload
    await requestUpload(
      t.db,
      folderId,
      { filename: "fresh.pdf", mimeType: "application/pdf", sizeBytes: 5 },
      boardMe(),
    );

    const swept = await sweepStalePendingUploads(t.db, new Date(Date.now() - 24 * 3600 * 1000));
    expect(swept).toBe(1);
    expect(removed).toHaveLength(1);
    const remaining = await t.db.select().from(files);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.filename).toBe("fresh.pdf");
  });
});

describeIfDb("group.created subscriber", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    setStorage(fakeStorage());
  });
  afterEach(async () => {
    unregisterFilesSubscribers();
    resetEventBus();
    await t.cleanup();
  });

  it("provisions the two folders for a newly created group", async () => {
    await t.client`INSERT INTO groups (id, slug, name, city) VALUES ('grp_new', 'new', 'Neustadt', 'Neustadt')`;
    registerFilesSubscribers(t.db);

    const event: GroupCreated = {
      type: "groups.group.created",
      groupId: "grp_new",
      slug: "new",
      at: new Date(),
    };
    await getEventBus().publish(event);

    const rows = (await t.db.select().from(folders)).filter((f) => f.groupId === "grp_new");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.scope).sort()).toEqual(["group_members", "local_board"]);

    // re-publish must not duplicate (idempotent)
    await getEventBus().publish(event);
    expect((await t.db.select().from(folders)).filter((f) => f.groupId === "grp_new")).toHaveLength(
      2,
    );
  });
});
