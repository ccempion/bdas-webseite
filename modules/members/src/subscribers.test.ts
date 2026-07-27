import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import { registerMembersSubscribers, unregisterMembersSubscribers } from "./subscribers";
import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

describeIfDb("members subscribers — group archived", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    unregisterMembersSubscribers();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
    await createUser(t, "usr_1", "1@example.de");
    await createUser(t, "usr_2", "2@example.de");
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_1', 'usr_1', 'Ann', 'Applicant', NULL, 'pending')
    `;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_2', 'usr_2', 'Ben', 'Bewerber', NULL, 'pending')
    `;
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
      VALUES ('mgc_1', 'mem_1', NULL, 'grp_a')
    `;
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
      VALUES ('mgc_2', 'mem_2', NULL, 'grp_b')
    `;
    registerMembersSubscribers(t.db);
  });

  afterEach(async () => {
    unregisterMembersSubscribers();
    await t.cleanup();
  });

  it("withdraws open applications to the archived group", async () => {
    await getEventBus().publish({
      type: "groups.group.archived",
      groupId: "grp_a",
      slug: "aachen",
      at: new Date(),
    });
    const [row] = await t.client`
      SELECT status, reason_category FROM member_group_change_requests WHERE id = 'mgc_1'
    `;
    expect(row!["status"]).toBe("withdrawn");
    expect(row!["reason_category"]).toBeNull();
  });

  it("does not say the applicant was rejected", async () => {
    await getEventBus().publish({
      type: "groups.group.archived",
      groupId: "grp_a",
      slug: "aachen",
      at: new Date(),
    });
    const rows = await t.client`
      SELECT id FROM member_group_change_requests WHERE status = 'rejected'
    `;
    expect(rows).toHaveLength(0);
  });

  it("leaves applications to other groups alone", async () => {
    await getEventBus().publish({
      type: "groups.group.archived",
      groupId: "grp_a",
      slug: "aachen",
      at: new Date(),
    });
    const [row] = await t.client`
      SELECT status FROM member_group_change_requests WHERE id = 'mgc_2'
    `;
    expect(row!["status"]).toBe("pending");
  });

  it("frees the applicant to apply elsewhere", async () => {
    await getEventBus().publish({
      type: "groups.group.archived",
      groupId: "grp_a",
      slug: "aachen",
      at: new Date(),
    });
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
      VALUES ('mgc_3', 'mem_1', NULL, 'grp_b')
    `;
    const rows = await t.client`
      SELECT id FROM member_group_change_requests WHERE member_id = 'mem_1' AND status = 'pending'
    `;
    expect(rows).toHaveLength(1);
  });
});
