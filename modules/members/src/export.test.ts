import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { exportForUser } from "./services/export";
import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

describeIfDb("members exportForUser", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
    for (const [uid, mid, mail] of [
      ["usr_me", "mem_me", "me@example.de"],
      ["usr_other", "mem_other", "other@example.de"],
    ] as const) {
      await createUser(t, uid, mail);
      await t.client`
        INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
        VALUES (${mid}, ${uid}, 'Test', ${mid}, 'grp_a', 'active')`;
    }
    await t.client`
      INSERT INTO member_role_grants (id, member_id, role, group_id, granted_by, revoked_at, revoked_by)
      VALUES ('g1', 'mem_me', 'blogger', NULL, 'mem_other', now(), 'mem_other'),
             ('g2', 'mem_me', 'file_manager', NULL, 'mem_other', NULL, NULL),
             ('g3', 'mem_other', 'blogger', NULL, 'mem_me', NULL, NULL)`;
    await t.client`
      INSERT INTO member_group_change_requests
        (id, member_id, from_group_id, to_group_id, status, decided_at, decided_by, reason_category, reason_message)
      VALUES ('r1', 'mem_me', 'grp_b', 'grp_a', 'rejected', now(), 'mem_other', 'other', 'Zu viele Anfragen'),
             ('r2', 'mem_me', 'grp_a', 'grp_b', 'approved', now(), 'mem_other', NULL, NULL),
             ('r3', 'mem_other', 'grp_a', 'grp_b', 'pending', NULL, NULL, NULL, NULL)`;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("returns the member row, all grants incl. revoked, and all group-change requests", async () => {
    const result = await exportForUser(t.db, "usr_me");

    expect(result.member?.id).toBe("mem_me");
    expect(result.roleGrants.map((g) => g.role).sort()).toEqual(["blogger", "file_manager"]);
    expect(result.roleGrants.find((g) => g.role === "blogger")?.revokedAt).toBeInstanceOf(Date);
    expect(result.groupChangeRequests.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    expect(result.groupChangeRequests.find((r) => r.id === "r1")?.reasonMessage).toBe(
      "Zu viele Anfragen",
    );
  });

  it("exposes exactly the documented keys on each row shape", async () => {
    const result = await exportForUser(t.db, "usr_me");

    expect(Object.keys(result.member ?? {}).sort()).toEqual([
      "createdAt",
      "firstName",
      "id",
      "joinedAt",
      "lastName",
      "primaryGroupId",
      "status",
      "updatedAt",
    ]);
    expect(Object.keys(result.roleGrants[0] ?? {}).sort()).toEqual([
      "grantedAt",
      "groupId",
      "revokedAt",
      "role",
    ]);
    expect(Object.keys(result.groupChangeRequests[0] ?? {}).sort()).toEqual([
      "decidedAt",
      "fromGroupId",
      "id",
      "reasonCategory",
      "reasonMessage",
      "requestedAt",
      "status",
      "toGroupId",
    ]);
  });

  it("never leaks another member's rows or the deciding/granting person's id", async () => {
    const json = JSON.stringify(await exportForUser(t.db, "usr_me"));

    expect(json).not.toContain("r3");
    expect(json).not.toContain("mem_other");
    expect(json).not.toContain("usr_other");
  });

  it("returns member: null and empty lists for an account without a member row", async () => {
    await createUser(t, "usr_bare", "bare@example.de");

    expect(await exportForUser(t.db, "usr_bare")).toEqual({
      member: null,
      roleGrants: [],
      groupChangeRequests: [],
    });
  });
});
