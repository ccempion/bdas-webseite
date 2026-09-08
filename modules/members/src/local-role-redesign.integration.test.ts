/**
 * Migration 0010 (local role redesign) backfill — integration test against a
 * real Postgres schema. Skips when DATABASE_URL is unreachable; CI brings up
 * a Postgres service.
 *
 * `setupMembersDb()` applies every members migration including 0010, so it
 * cannot exercise the backfill itself (by the time a test runs, `local_board`
 * is already gone from the CHECK domain). These tests instead build a
 * pre-0010 schema, seed `local_board` rows the old code could have produced,
 * apply 0010 by hand, and assert the resulting state.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

import { MEMBERS_TEST_MIGRATIONS, createGroup, createUser, dbReachable } from "./test-db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

/** Every members migration EXCEPT 0010 — the schema as it looked right
 *  before this migration ran, i.e. the state real production data was in. */
async function setupPreRedesignDb(): Promise<TestDb> {
  const t = await createTestDb();
  const preMigrations = MEMBERS_TEST_MIGRATIONS.filter(
    (file) => file[file.length - 1] !== "0010_local_role_redesign.sql",
  );
  for (const file of preMigrations) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
  return t;
}

async function applyLocalRoleRedesign(t: TestDb): Promise<void> {
  const sql = await fs.readFile(
    path.join(__dirname, "..", "migrations", "0010_local_role_redesign.sql"),
    "utf8",
  );
  await t.client.unsafe(sql);
}

describeIfDb("0010_local_role_redesign backfill", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupPreRedesignDb();
    await createGroup(t, "grp_x", "muster-x");
    await createGroup(t, "grp_y", "muster-y");
    await createGroup(t, "grp_z", "muster-z");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  async function seedMember(id: string, userId: string): Promise<void> {
    await createUser(t, userId, `${userId}@example.de`);
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES (${id}, ${userId}, 'Test', 'Person', NULL, 'active')
    `;
  }

  async function grant(
    memberId: string,
    role: string,
    groupId: string,
    grantId: string,
  ): Promise<void> {
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES (${grantId}, ${memberId}, ${role}, ${groupId}, 'usr_seed')
    `;
  }

  async function revoke(grantId: string): Promise<void> {
    await t.client`
      UPDATE member_role_grants SET revoked_at = now(), revoked_by = 'usr_seed'
      WHERE id = ${grantId}
    `;
  }

  async function activeRolesFor(memberId: string): Promise<string[]> {
    const rows = await t.client<{ role: string }[]>`
      SELECT role FROM member_role_grants
      WHERE member_id = ${memberId} AND revoked_at IS NULL
      ORDER BY role
    `;
    return rows.map((r) => r.role);
  }

  it("renames a lone active local_board grant to local_board_lead", async () => {
    await seedMember("mem_a", "usr_a");
    await grant("mem_a", "local_board", "grp_x", "mrg_a1");

    await applyLocalRoleRedesign(t);

    expect(await activeRolesFor("mem_a")).toEqual(["local_board_lead"]);
  });

  it("dedups a member holding both local_board and local_board_lead for the same group: exactly one active local_board_lead row remains", async () => {
    await seedMember("mem_b", "usr_b");
    await grant("mem_b", "local_board", "grp_y", "mrg_b1");
    await grant("mem_b", "local_board_lead", "grp_y", "mrg_b2");

    await applyLocalRoleRedesign(t);

    expect(await activeRolesFor("mem_b")).toEqual(["local_board_lead"]);
    const revokedRow = await t.client<{ id: string; revoked_at: Date | null }[]>`
      SELECT id, revoked_at FROM member_role_grants WHERE id = 'mrg_b1'
    `;
    expect(revokedRow[0]?.revoked_at).not.toBeNull(); // the redundant local_board row is revoked, not deleted
  });

  it("does not touch a local_board_lead the member already holds for a DIFFERENT group", async () => {
    await seedMember("mem_c", "usr_c");
    await grant("mem_c", "local_board", "grp_x", "mrg_c1");
    await grant("mem_c", "local_board_lead", "grp_y", "mrg_c2");

    await applyLocalRoleRedesign(t);

    const rows = await t.client<{ group_id: string; role: string }[]>`
      SELECT group_id, role FROM member_role_grants
      WHERE member_id = ${"mem_c"} AND revoked_at IS NULL
      ORDER BY group_id
    `;
    expect(rows).toEqual([
      { group_id: "grp_x", role: "local_board_lead" },
      { group_id: "grp_y", role: "local_board_lead" },
    ]);
  });

  it("rewrites a revoked (historical) local_board row to local_board_lead too", async () => {
    await seedMember("mem_d", "usr_d");
    await grant("mem_d", "local_board", "grp_z", "mrg_d1");
    await revoke("mrg_d1");

    await applyLocalRoleRedesign(t);

    const rows = await t.client<{ role: string; revoked_at: Date | null }[]>`
      SELECT role, revoked_at FROM member_role_grants WHERE member_id = ${"mem_d"}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("local_board_lead");
    expect(rows[0]?.revoked_at).not.toBeNull();
  });

  it("rejects local_board as a role once the migration has run (CHECK constraint narrowed)", async () => {
    await seedMember("mem_e", "usr_e");
    await applyLocalRoleRedesign(t);

    await expect(grant("mem_e", "local_board", "grp_x", "mrg_e1")).rejects.toThrow();
  });

  it("accepts file_manager and blogger as roles once the migration has run (CHECK domain widened)", async () => {
    await seedMember("mem_f", "usr_f");
    await applyLocalRoleRedesign(t);

    await grant("mem_f", "file_manager", "grp_x", "mrg_f1");
    await grant("mem_f", "blogger", "grp_x", "mrg_f2");

    expect(await activeRolesFor("mem_f")).toEqual(["blogger", "file_manager"]);
  });
});
