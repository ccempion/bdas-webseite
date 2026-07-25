/**
 * board-recipients — integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { listBoardRecipientsForGroup } from "./services/board-recipients";
import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

describeIfDb("listBoardRecipientsForGroup", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** Insert a member row (no auth_user required for these grant-only reads). */
  async function createMember(id: string, userId: string): Promise<void> {
    await createUser(t, userId, `${userId}@example.de`);
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES (${id}, ${userId}, 'Test', 'Person', 'grp_a', 'active')
    `;
  }

  async function grant(
    memberId: string,
    role: string,
    groupId: string | null,
    grantId: string,
  ): Promise<void> {
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by)
      VALUES (${grantId}, ${memberId}, ${role}, ${groupId}, 'usr_seed')
    `;
  }

  it("returns the group's active local_board + local_board_lead grantees", async () => {
    await createMember("mem_lead", "usr_lead");
    await createMember("mem_board", "usr_board");
    await createMember("mem_federal", "usr_federal");

    await grant("mem_lead", "local_board_lead", "grp_a", "mrg_1");
    await grant("mem_board", "local_board", "grp_a", "mrg_2");
    await grant("mem_federal", "federal_board", null, "mrg_3");

    const ids = await listBoardRecipientsForGroup(t.db, "grp_a");

    expect(new Set(ids)).toEqual(new Set(["mem_lead", "mem_board"]));
  });

  it("excludes revoked grants", async () => {
    await createMember("mem_lead", "usr_lead");
    await grant("mem_lead", "local_board_lead", "grp_a", "mrg_1");
    await t.client`
      UPDATE member_role_grants SET revoked_at = now() WHERE id = 'mrg_1'
    `;

    const ids = await listBoardRecipientsForGroup(t.db, "grp_a");

    expect(ids).toEqual([]);
  });

  it("falls back to the federal board when the group has no local board", async () => {
    await createMember("mem_federal", "usr_federal");
    await grant("mem_federal", "federal_board", null, "mrg_1");

    const ids = await listBoardRecipientsForGroup(t.db, "grp_b");

    expect(ids).toEqual(["mem_federal"]);
  });

  it("falls back to the federal board for an unknown group id", async () => {
    await createMember("mem_federal", "usr_federal");
    await grant("mem_federal", "federal_board", null, "mrg_1");

    const ids = await listBoardRecipientsForGroup(t.db, "grp_does_not_exist");

    expect(ids).toEqual(["mem_federal"]);
  });

  it("falls back to the federal board when groupId is null", async () => {
    await createMember("mem_federal", "usr_federal");
    await grant("mem_federal", "federal_board", null, "mrg_1");

    const ids = await listBoardRecipientsForGroup(t.db, null);

    expect(ids).toEqual(["mem_federal"]);
  });
});
