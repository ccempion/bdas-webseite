import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

describeIfDb("group change requests — schema", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
    await createUser(t, "usr_cem", "cem@example.de");
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_cem', 'usr_cem', 'Cem', 'Colak', 'grp_a', 'active')
    `;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("allows at most one open request per member", async () => {
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
      VALUES ('mgc_1', 'mem_cem', 'grp_a', 'grp_b')
    `;
    await expect(
      t.client`
        INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
        VALUES ('mgc_2', 'mem_cem', 'grp_a', 'grp_b')
      `,
    ).rejects.toThrow();
  });

  it("allows a second request once the first is terminal", async () => {
    await t.client`
      INSERT INTO member_group_change_requests
        (id, member_id, from_group_id, to_group_id, status, decided_at, decided_by)
      VALUES ('mgc_1', 'mem_cem', 'grp_a', 'grp_b', 'withdrawn', now(), 'usr_cem')
    `;
    await t.client`
      INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
      VALUES ('mgc_2', 'mem_cem', 'grp_a', 'grp_b')
    `;
    const rows = await t.client`SELECT id FROM member_group_change_requests`;
    expect(rows.length).toBe(2);
  });

  it("rejects a pending row that is already decided", async () => {
    await expect(
      t.client`
        INSERT INTO member_group_change_requests
          (id, member_id, from_group_id, to_group_id, status, decided_at)
        VALUES ('mgc_1', 'mem_cem', 'grp_a', 'grp_b', 'pending', now())
      `,
    ).rejects.toThrow();
  });

  it("rejects a request that does not move the member", async () => {
    await expect(
      t.client`
        INSERT INTO member_group_change_requests (id, member_id, from_group_id, to_group_id)
        VALUES ('mgc_1', 'mem_cem', 'grp_a', 'grp_a')
      `,
    ).rejects.toThrow();
  });
});
