/**
 * Integration tests for folder create/rename/delete against a real schema.
 * Permission inheritance is the property under test: a subfolder must be
 * readable and writable by exactly the people its root is.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import type { CurrentMember, Grant } from "@bdas/members";

import { files } from "./schema";
import { createFolder, deleteFolder, renameFolder } from "./services/folder-writes";
import { ensureFolders, listFolders } from "./services/folders";

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
  for (const file of [
    ["..", "..", "auth", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0001_init.sql"],
    ["..", "..", "groups", "migrations", "0004_location.sql"],
    ["..", "..", "members", "migrations", "0001_init.sql"],
    ["..", "migrations", "0001_init.sql"],
    ["..", "migrations", "0002_rls_lockdown.sql"],
    ["..", "migrations", "0003_folder_nesting.sql"],
  ]) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
}

function actor(grants: Grant[], memberId = "mbr_board"): CurrentMember {
  return {
    user: { id: "usr_1", email: "b@x.org", status: "active", roles: [], sessionId: "ses_1" },
    member: {
      id: memberId,
      userId: "usr_1",
      firstName: "B",
      lastName: "V",
      primaryGroupId: "grp_a",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants,
  };
}

const BOARD_A: Grant[] = [{ role: "local_board", groupId: "grp_a" }];
const BOARD_B: Grant[] = [{ role: "local_board", groupId: "grp_b" }];
const PLAIN: Grant[] = [{ role: "member", groupId: null }];

/**
 * Migrate, seed two groups plus one board member, provision the system roots,
 * and hand back group A's `local_board` root — the parent every suite writes to.
 */
async function seedBoardRoot(t: TestDb): Promise<string> {
  await applyMigrations(t);
  await t.client`
    INSERT INTO groups (id, slug, name, city, status) VALUES
      ('grp_a', 'a', 'Gruppe A', 'Stadt', 'active'),
      ('grp_b', 'b', 'Gruppe B', 'Stadt', 'active')
  `;
  await t.client`
    INSERT INTO auth_users (id, email_normalized, email_display, status)
    VALUES ('usr_1', 'b@x.org', 'b@x.org', 'active')
  `;
  await t.client`
    INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
    VALUES ('mbr_board', 'usr_1', 'B', 'V', 'grp_a', 'active')
  `;
  await ensureFolders(t.db);
  const rows = await t.client`
    SELECT id FROM folders WHERE scope = 'local_board' AND group_id = 'grp_a'
  `;
  return String(rows[0]?.["id"]);
}

describeIfDb("createFolder", () => {
  let t: TestDb;
  let boardRoot: string;

  beforeEach(async () => {
    t = await createTestDb();
    boardRoot = await seedBoardRoot(t);
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("creates a child that inherits scope, group, and depth+1", async () => {
    const f = await createFolder(t.db, { parentId: boardRoot, name: "Protokolle" }, actor(BOARD_A));
    expect(f.scope).toBe("local_board");
    expect(f.groupId).toBe("grp_a");
    expect(f.parentId).toBe(boardRoot);
    expect(f.depth).toBe(1);
    expect(f.slug).toBe("protokolle");
    expect(f.createdBy).toBe("mbr_board");
  });

  it("makes the child visible to exactly whoever sees the parent", async () => {
    await createFolder(t.db, { parentId: boardRoot, name: "Protokolle" }, actor(BOARD_A));

    const forOwnBoard = await listFolders(t.db, actor(BOARD_A));
    expect(forOwnBoard.some((f) => f.name === "Protokolle")).toBe(true);

    const forOtherBoard = await listFolders(t.db, actor(BOARD_B, "mbr_board"));
    expect(forOtherBoard.some((f) => f.name === "Protokolle")).toBe(false);

    const forPlainMember = await listFolders(t.db, actor(PLAIN));
    expect(forPlainMember.some((f) => f.name === "Protokolle")).toBe(false);
  });

  it("refuses a member without write permission on the parent", async () => {
    await expect(
      createFolder(t.db, { parentId: boardRoot, name: "Fremd" }, actor(BOARD_B, "mbr_board")),
    ).rejects.toThrow("Kein Schreibzugriff auf diesen Ordner.");
  });

  it("refuses a duplicate name among siblings", async () => {
    await createFolder(t.db, { parentId: boardRoot, name: "Protokolle" }, actor(BOARD_A));
    await expect(
      createFolder(t.db, { parentId: boardRoot, name: "protokolle" }, actor(BOARD_A)),
    ).rejects.toThrow("Ein Ordner mit diesem Namen existiert hier bereits.");
  });

  it("refuses an empty or oversized name", async () => {
    await expect(
      createFolder(t.db, { parentId: boardRoot, name: "   " }, actor(BOARD_A)),
    ).rejects.toThrow("Ordnername darf nicht leer sein.");
    await expect(
      createFolder(t.db, { parentId: boardRoot, name: "a".repeat(81) }, actor(BOARD_A)),
    ).rejects.toThrow("Ordnername ist zu lang (max. 80 Zeichen).");
  });

  it("refuses a sixth level", async () => {
    let parent = boardRoot;
    for (let d = 1; d <= 5; d++) {
      const f = await createFolder(t.db, { parentId: parent, name: `Ebene ${d}` }, actor(BOARD_A));
      parent = f.id;
    }
    await expect(
      createFolder(t.db, { parentId: parent, name: "Zu tief" }, actor(BOARD_A)),
    ).rejects.toThrow("Maximale Ordnertiefe (5) erreicht.");
  });

  it("refuses an unknown parent", async () => {
    await expect(
      createFolder(t.db, { parentId: "fld_nope", name: "X" }, actor(BOARD_A)),
    ).rejects.toThrow("Ordner nicht gefunden.");
  });
});

describeIfDb("renameFolder", () => {
  let t: TestDb;
  let boardRoot: string;
  let child: string;

  beforeEach(async () => {
    t = await createTestDb();
    boardRoot = await seedBoardRoot(t);
    child = (await createFolder(t.db, { parentId: boardRoot, name: "Alt" }, actor(BOARD_A))).id;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("renames a subfolder and recomputes its slug", async () => {
    const f = await renameFolder(t.db, child, { name: "Protokolle 2026" }, actor(BOARD_A));
    expect(f.name).toBe("Protokolle 2026");
    expect(f.slug).toBe("protokolle-2026");
  });

  it("updates the description", async () => {
    const f = await renameFolder(
      t.db,
      child,
      { name: "Alt", description: "Nur beschlossene Protokolle." },
      actor(BOARD_A),
    );
    expect(f.description).toBe("Nur beschlossene Protokolle.");
  });

  it("refuses to rename a system root", async () => {
    await expect(
      renameFolder(t.db, boardRoot, { name: "Umbenannt" }, actor(BOARD_A)),
    ).rejects.toThrow("Systemordner können nicht umbenannt werden.");
  });

  it("refuses a name already used by a sibling", async () => {
    await createFolder(t.db, { parentId: boardRoot, name: "Finanzen" }, actor(BOARD_A));
    await expect(renameFolder(t.db, child, { name: "Finanzen" }, actor(BOARD_A))).rejects.toThrow(
      "Ein Ordner mit diesem Namen existiert hier bereits.",
    );
  });

  it("allows renaming a folder to its own current name", async () => {
    const f = await renameFolder(t.db, child, { name: "Alt" }, actor(BOARD_A));
    expect(f.name).toBe("Alt");
  });

  it("refuses a member without write permission", async () => {
    await expect(
      renameFolder(t.db, child, { name: "Fremd" }, actor(BOARD_B, "mbr_board")),
    ).rejects.toThrow("Kein Schreibzugriff auf diesen Ordner.");
  });
});

describeIfDb("deleteFolder", () => {
  let t: TestDb;
  let boardRoot: string;
  let child: string;

  beforeEach(async () => {
    t = await createTestDb();
    boardRoot = await seedBoardRoot(t);
    child = (await createFolder(t.db, { parentId: boardRoot, name: "Leer" }, actor(BOARD_A))).id;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("deletes an empty subfolder", async () => {
    await deleteFolder(t.db, child, actor(BOARD_A));
    const rows = await t.client`SELECT count(*)::int AS n FROM folders WHERE id = ${child}`;
    expect(rows[0]?.["n"]).toBe(0);
  });

  it("refuses a folder that still holds a file", async () => {
    await t.db.insert(files).values({
      id: "fil_1",
      folderId: child,
      filename: "a.pdf",
      storageKey: "k/a.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      status: "ready",
      uploadedBy: "mbr_board",
    });
    await expect(deleteFolder(t.db, child, actor(BOARD_A))).rejects.toThrow(
      "Ordner ist nicht leer.",
    );
    // files.folder_id is ON DELETE CASCADE, so a delete that slipped through
    // would destroy the file silently and orphan its storage object.
    const rows = await t.client`SELECT count(*)::int AS n FROM files WHERE id = 'fil_1'`;
    expect(rows[0]?.["n"]).toBe(1);
  });

  it("refuses a folder that still holds a subfolder", async () => {
    const grandchild = await createFolder(t.db, { parentId: child, name: "Enkel" }, actor(BOARD_A));
    await expect(deleteFolder(t.db, child, actor(BOARD_A))).rejects.toThrow(
      "Ordner ist nicht leer.",
    );
    const rows = await t.client`SELECT count(*)::int AS n FROM folders WHERE id = ${grandchild.id}`;
    expect(rows[0]?.["n"]).toBe(1);
  });

  it("refuses to delete a system root", async () => {
    await expect(deleteFolder(t.db, boardRoot, actor(BOARD_A))).rejects.toThrow(
      "Systemordner können nicht gelöscht werden.",
    );
  });

  it("refuses a member without write permission", async () => {
    await expect(deleteFolder(t.db, child, actor(BOARD_B, "mbr_board"))).rejects.toThrow(
      "Kein Schreibzugriff auf diesen Ordner.",
    );
  });
});
