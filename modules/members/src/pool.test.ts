import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { listGrouplessMembers } from "./services/pool";
import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";
import type { Grant } from "./index";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

const FEDERAL = {
  userId: "usr_federal",
  grants: [{ role: "federal_board", groupId: null }] as ReadonlyArray<Grant>,
};
const LOCAL = {
  userId: "usr_local",
  grants: [{ role: "local_board", groupId: "grp_a" }] as ReadonlyArray<Grant>,
};

describeIfDb("groupless pool", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    await createGroup(t, "grp_a", "aachen");
    for (const [id, email] of [
      ["usr_1", "1@example.de"],
      ["usr_2", "2@example.de"],
      ["usr_3", "3@example.de"],
      ["usr_4", "4@example.de"],
      ["usr_5", "5@example.de"],
    ]) {
      await createUser(t, id!, email!);
    }
    // applicant, never accepted
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_1', 'usr_1', 'Ann', 'Applicant', NULL, 'pending')
    `;
    // member between groups
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_2', 'usr_2', 'Ben', 'Between', NULL, 'active', now())
    `;
    // ordinary member with a group
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_3', 'usr_3', 'Cara', 'Current', 'grp_a', 'active', now())
    `;
    // deactivated, groupless
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_4', 'usr_4', 'Dan', 'Deactivated', NULL, 'inactive', now())
    `;
    // alumnus, groupless
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_5', 'usr_5', 'Eva', 'Alumna', NULL, 'alumnus', now())
    `;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("returns groupless applicants and members between groups", async () => {
    const pool = await listGrouplessMembers(t.db, FEDERAL);
    expect(pool.map((p) => p.member.id).sort()).toEqual(["mem_1", "mem_2"]);
  });

  it("excludes members who have a group", async () => {
    const pool = await listGrouplessMembers(t.db, FEDERAL);
    expect(pool.map((p) => p.member.id)).not.toContain("mem_3");
  });

  it("excludes deactivated people — they are not looking", async () => {
    const pool = await listGrouplessMembers(t.db, FEDERAL);
    expect(pool.map((p) => p.member.id)).not.toContain("mem_4");
  });

  it("excludes alumni — they are not looking", async () => {
    const pool = await listGrouplessMembers(t.db, FEDERAL);
    expect(pool.map((p) => p.member.id)).not.toContain("mem_5");
  });

  it("is empty for a local board", async () => {
    expect(await listGrouplessMembers(t.db, LOCAL)).toEqual([]);
  });
});
