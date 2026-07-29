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

import { createFolder } from "./services/folder-writes";
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

describeIfDb("createFolder", () => {
  let t: TestDb;
  let boardRoot: string;

  beforeEach(async () => {
    t = await createTestDb();
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
    boardRoot = String(rows[0]?.["id"]);
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
