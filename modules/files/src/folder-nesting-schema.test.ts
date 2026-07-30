/**
 * Schema-level guarantees of 0003_folder_nesting.sql. These assert the database
 * refuses invalid nesting even if a service forgets to — the trigger is the
 * backstop for the inheritance invariant (spec D1).
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

describeIfDb("0003_folder_nesting", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    await applyMigrations(t);
    await t.client`
      INSERT INTO groups (id, slug, name, city, status)
      VALUES ('grp_a', 'a', 'Gruppe A', 'Stadt', 'active')
    `;
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_root', 'local-board-grp_a', 'A – Vorstand', 'local_board', 'grp_a', NULL, 0)
    `;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("accepts a child that copies the parent's scope and group", async () => {
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_c1', 'protokolle', 'Protokolle', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    const rows = await t.client`SELECT depth FROM folders WHERE id = 'fld_c1'`;
    expect(rows[0]?.["depth"]).toBe(1);
  });

  it("rejects a child whose scope differs from its parent", async () => {
    await expect(
      t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES ('fld_bad', 'offen', 'Offen', 'group_members', 'grp_a', 'fld_root', 1)
      `,
    ).rejects.toThrow(/erbt/i);
  });

  it("rejects a child whose depth is not parent depth + 1", async () => {
    await expect(
      t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES ('fld_bad', 'tief', 'Tief', 'local_board', 'grp_a', 'fld_root', 3)
      `,
    ).rejects.toThrow(/Tiefe/i);
  });

  it("rejects a sixth level", async () => {
    let parent = "fld_root";
    for (let d = 1; d <= 5; d++) {
      const id = `fld_d${d}`;
      await t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES (${id}, ${`ebene-${d}`}, ${`Ebene ${d}`}, 'local_board', 'grp_a', ${parent}, ${d})
      `;
      parent = id;
    }
    await expect(
      t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES ('fld_d6', 'ebene-6', 'Ebene 6', 'local_board', 'grp_a', ${parent}, 6)
      `,
    ).rejects.toThrow(/Tiefe/i);
  });

  it("allows the same slug under different parents", async () => {
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_x1', 'x', 'X', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_y', 'y', 'Y', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_x2', 'x', 'X', 'local_board', 'grp_a', 'fld_y', 2)
    `;
    const rows = await t.client`SELECT count(*)::int AS n FROM folders WHERE slug = 'x'`;
    expect(rows[0]?.["n"]).toBe(2);
  });

  it("rejects two children with the same slug under one parent", async () => {
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_s1', 'gleich', 'Gleich', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    await expect(
      t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES ('fld_s2', 'gleich', 'Gleich', 'local_board', 'grp_a', 'fld_root', 1)
      `,
    ).rejects.toThrow(/folders_sibling_slug_uq/);
  });

  it("still allows only one root per (scope, group)", async () => {
    await expect(
      t.client`
        INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
        VALUES ('fld_dup', 'anderer-slug', 'Doppelt', 'local_board', 'grp_a', NULL, 0)
      `,
    ).rejects.toThrow(/folders_root_scope_group_uq/);
  });

  it("rejects an UPDATE that makes a folder its own parent", async () => {
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_c1', 'protokolle', 'Protokolle', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    await expect(
      t.client`UPDATE folders SET parent_id = 'fld_c1', depth = depth + 1 WHERE id = 'fld_c1'`,
    ).rejects.toThrow(/eigener Elternordner/i);
  });

  it("allows an UPDATE that re-parents a folder to a valid same-scope sibling", async () => {
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_a', 'a', 'A', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    await t.client`
      INSERT INTO folders (id, slug, name, scope, group_id, parent_id, depth)
      VALUES ('fld_b', 'b', 'B', 'local_board', 'grp_a', 'fld_root', 1)
    `;
    await t.client`UPDATE folders SET parent_id = 'fld_a', depth = 2 WHERE id = 'fld_b'`;
    const rows = await t.client`SELECT parent_id, depth FROM folders WHERE id = 'fld_b'`;
    expect(rows[0]?.["parent_id"]).toBe("fld_a");
    expect(rows[0]?.["depth"]).toBe(2);
  });
});
