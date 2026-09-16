/**
 * Integration tests for the per-person folder grant (Spec 2026-09-16 §5.3)
 * against a real schema: only the federal board grants, a grant opens exactly
 * the granted folder and its subfolders, and the file services honour it.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import type { CurrentMember, Grant } from "@bdas/members";

import { canRead, canWrite } from "./permissions";
import { grantFolderAccess, listFolderAccess, revokeFolderAccess } from "./index";
import { createFolder } from "./services/folder-writes";
import { loadFolderAccess } from "./services/folder-access";
import { ensureFolders, getFolder, listFolders } from "./services/folders";
import { listFiles } from "./services/files";

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
    ["..", "..", "groups", "migrations", "0005_image_key.sql"],
    ["..", "..", "groups", "migrations", "0007_group_kind.sql"],
    ["..", "..", "groups", "migrations", "0008_group_kind_netzwerk.sql"],
    ["..", "..", "members", "migrations", "0001_init.sql"],
    ["..", "migrations", "0001_init.sql"],
    ["..", "migrations", "0002_rls_lockdown.sql"],
    ["..", "migrations", "0003_folder_nesting.sql"],
    ["..", "migrations", "0004_board_broadcast_scope.sql"],
    ["..", "migrations", "0005_folder_member_grants.sql"],
  ]) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
}

function viewer(
  memberId: string,
  grants: Grant[],
  opts: { groupId: string | null; isBdasMember: boolean },
): CurrentMember {
  return {
    user: { id: `usr_${memberId}`, email: "x@x.org", status: "active", roles: [], sessionId: "s" },
    member: {
      id: memberId,
      userId: `usr_${memberId}`,
      firstName: "F",
      lastName: "L",
      primaryGroupId: opts.groupId,
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants,
    primaryGroupKind: opts.groupId ? "hochschulgruppe" : null,
    hasGroupScope: opts.groupId !== null,
    isBdasMember: opts.isBdasMember,
  };
}

const BOARD = viewer("mbr_board", [{ role: "federal_board", groupId: null }], {
  groupId: "grp_b",
  isBdasMember: true,
});
const LEAD_OF_OTHER_GROUP = viewer("mbr_lead_b", [{ role: "local_board_lead", groupId: "grp_b" }], {
  groupId: "grp_b",
  isBdasMember: true,
});
const OUTSIDER = viewer("mbr_out", [], { groupId: null, isBdasMember: false });

/** Seed groups, the three members above, provision folders; return group A's board root. */
async function seed(t: TestDb): Promise<string> {
  await applyMigrations(t);
  await t.client`
    INSERT INTO groups (id, slug, name, city, status) VALUES
      ('grp_a', 'a', 'Gruppe A', 'Stadt', 'active'),
      ('grp_b', 'b', 'Gruppe B', 'Stadt', 'active')
  `;
  for (const m of [BOARD, LEAD_OF_OTHER_GROUP, OUTSIDER]) {
    const member = m.member!;
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES (${member.userId}, ${member.id + "@x.org"}, ${member.id + "@x.org"}, 'active')
    `;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES (${member.id}, ${member.userId}, 'F', 'L', ${member.primaryGroupId}, 'active')
    `;
  }
  await ensureFolders(t.db);
  const rows = await t.client`
    SELECT id FROM folders WHERE scope = 'local_board' AND group_id = 'grp_a'
  `;
  return String(rows[0]?.["id"]);
}

describeIfDb("Ordnerfreigabe pro Person", () => {
  let t: TestDb;
  let folderId: string;

  beforeEach(async () => {
    t = await createTestDb();
    folderId = await seed(t);
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("öffnet genau einen Ordner für genau eine Person, bis zum Widerruf", async () => {
    const folder = await getFolder(t.db, folderId);
    expect(canRead(folder, OUTSIDER, await loadFolderAccess(t.db, "mbr_out"))).toBe(false);

    await grantFolderAccess(t.db, folderId, "mbr_out", { canWrite: false }, BOARD);
    const access = await loadFolderAccess(t.db, "mbr_out");
    expect(canRead(folder, OUTSIDER, access)).toBe(true);
    expect(canWrite(folder, OUTSIDER, access)).toBe(false);
    expect(await loadFolderAccess(t.db, "mbr_lead_b")).toEqual(new Map());

    await revokeFolderAccess(t.db, folderId, "mbr_out", BOARD);
    expect(canRead(folder, OUTSIDER, await loadFolderAccess(t.db, "mbr_out"))).toBe(false);
  });

  it("nur der Bundesvorstand vergibt und widerruft Freigaben", async () => {
    await expect(
      grantFolderAccess(t.db, folderId, "mbr_out", {}, LEAD_OF_OTHER_GROUP),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(grantFolderAccess(t.db, folderId, "mbr_out", {}, OUTSIDER)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await grantFolderAccess(t.db, folderId, "mbr_out", {}, BOARD);
    await expect(
      revokeFolderAccess(t.db, folderId, "mbr_out", LEAD_OF_OTHER_GROUP),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await listFolderAccess(t.db, folderId, BOARD)).toEqual([
      { memberId: "mbr_out", canWrite: false },
    ]);
  });

  it("nur der Bundesvorstand sieht, wer freigegeben ist", async () => {
    await expect(listFolderAccess(t.db, folderId, LEAD_OF_OTHER_GROUP)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("eine erneute Freigabe ändert die offene Zeile, statt eine zweite anzulegen", async () => {
    await grantFolderAccess(t.db, folderId, "mbr_out", { canWrite: false }, BOARD);
    await grantFolderAccess(t.db, folderId, "mbr_out", { canWrite: true }, BOARD);
    expect(await listFolderAccess(t.db, folderId, BOARD)).toEqual([
      { memberId: "mbr_out", canWrite: true },
    ]);
  });

  it("widerrufene Freigaben bleiben als Protokoll liegen", async () => {
    await grantFolderAccess(t.db, folderId, "mbr_out", {}, BOARD);
    await revokeFolderAccess(t.db, folderId, "mbr_out", BOARD);
    await grantFolderAccess(t.db, folderId, "mbr_out", {}, BOARD);
    const rows = await t.client`
      SELECT revoked_by FROM folder_member_grants WHERE member_id = 'mbr_out' ORDER BY revoked_at NULLS LAST
    `;
    expect(rows.map((r) => r["revoked_by"])).toEqual(["mbr_board", null]);
  });

  it("unbekannter Ordner oder unbekannte Person wird abgewiesen", async () => {
    await expect(grantFolderAccess(t.db, "fld_nope", "mbr_out", {}, BOARD)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(grantFolderAccess(t.db, folderId, "mbr_nope", {}, BOARD)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("die Freigabe gilt auch für Unterordner, wie jede Ordnerberechtigung", async () => {
    const child = await createFolder(t.db, { parentId: folderId, name: "Protokolle" }, BOARD);
    const grandchild = await createFolder(t.db, { parentId: child.id, name: "2026" }, BOARD);

    await grantFolderAccess(t.db, folderId, "mbr_out", { canWrite: false }, BOARD);
    await grantFolderAccess(t.db, child.id, "mbr_out", { canWrite: true }, BOARD);
    const access = await loadFolderAccess(t.db, "mbr_out");

    expect(canRead(await getFolder(t.db, folderId), OUTSIDER, access)).toBe(true);
    expect(canWrite(await getFolder(t.db, folderId), OUTSIDER, access)).toBe(false);
    expect(canWrite(child, OUTSIDER, access)).toBe(true);
    expect(canWrite(grandchild, OUTSIDER, access)).toBe(true);
  });

  it("die Dateidienste reichen die Freigabe durch", async () => {
    await expect(listFiles(t.db, folderId, OUTSIDER)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createFolder(t.db, { parentId: folderId, name: "Neu" }, OUTSIDER),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await grantFolderAccess(t.db, folderId, "mbr_out", { canWrite: true }, BOARD);

    expect((await listFolders(t.db, OUTSIDER)).map((f) => f.id)).toEqual([folderId]);
    expect(await listFiles(t.db, folderId, OUTSIDER)).toEqual([]);
    await expect(
      createFolder(t.db, { parentId: folderId, name: "Neu" }, OUTSIDER),
    ).resolves.toMatchObject({ parentId: folderId });
  });

  it("das Löschen des Ordners räumt seine Freigaben mit ab", async () => {
    const child = await createFolder(t.db, { parentId: folderId, name: "Weg" }, BOARD);
    await grantFolderAccess(t.db, child.id, "mbr_out", {}, BOARD);
    await t.client`DELETE FROM folders WHERE id = ${child.id}`;
    expect(await loadFolderAccess(t.db, "mbr_out")).toEqual(new Map());
  });
});
