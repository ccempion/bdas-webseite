import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

/**
 * The migration runs as part of setupMembersDb, so a fixture inserted here is
 * already migrated. To test the migration itself we insert the pre-migration
 * shapes, then re-run only the data steps — which are idempotent by
 * construction (NOT EXISTS guard, and the UPDATEs are no-ops once applied).
 */
describeIfDb("0008 application reasons — data migration", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    await createGroup(t, "grp_a", "aachen");
    for (const [id, email] of [
      ["usr_p", "p@example.de"],
      ["usr_r", "r@example.de"],
      ["usr_f", "f@example.de"],
      ["usr_a", "a@example.de"],
    ]) {
      await createUser(t, id!, email!);
    }
    // pending applicant with a group nobody approved
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_p', 'usr_p', 'Pia', 'Pending', 'grp_a', 'pending')
    `;
    // rejected applicant: inactive, never joined
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_r', 'usr_r', 'Rea', 'Rejected', 'grp_a', 'inactive', NULL)
    `;
    // genuine former member: inactive, but did join once
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_f', 'usr_f', 'Fred', 'Former', 'grp_a', 'inactive', now())
    `;
    // ordinary active member
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_a', 'usr_a', 'Ada', 'Active', 'grp_a', 'active', now())
    `;
    await runDataSteps(t);
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("turns a pending member's group choice into a pending request", async () => {
    const [member] = await t.client`SELECT primary_group_id FROM members WHERE id = 'mem_p'`;
    expect(member!["primary_group_id"]).toBeNull();

    const rows = await t.client`
      SELECT to_group_id, status FROM member_group_change_requests WHERE member_id = 'mem_p'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!["to_group_id"]).toBe("grp_a");
    expect(rows[0]!["status"]).toBe("pending");
  });

  it("returns a rejected applicant to the pool with a rejection on record", async () => {
    const [member] = await t.client`
      SELECT status, primary_group_id FROM members WHERE id = 'mem_r'
    `;
    expect(member!["status"]).toBe("pending");
    expect(member!["primary_group_id"]).toBeNull();

    const rows = await t.client`
      SELECT status, to_group_id, reason_category
        FROM member_group_change_requests WHERE member_id = 'mem_r'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!["status"]).toBe("rejected");
    expect(rows[0]!["to_group_id"]).toBe("grp_a");
    expect(rows[0]!["reason_category"]).toBe("other");
  });

  it("leaves a genuine former member untouched", async () => {
    const [member] = await t.client`
      SELECT status, primary_group_id FROM members WHERE id = 'mem_f'
    `;
    expect(member!["status"]).toBe("inactive");
    expect(member!["primary_group_id"]).toBe("grp_a");
  });

  it("leaves an active member untouched", async () => {
    const [member] = await t.client`
      SELECT status, primary_group_id FROM members WHERE id = 'mem_a'
    `;
    expect(member!["status"]).toBe("active");
    expect(member!["primary_group_id"]).toBe("grp_a");
  });

  it("never leaves a pending member holding an unapproved group", async () => {
    const rows = await t.client`
      SELECT id FROM members WHERE status = 'pending' AND primary_group_id IS NOT NULL
    `;
    expect(rows).toHaveLength(0);
  });

  it("is idempotent — a second run inserts no duplicate request", async () => {
    await runDataSteps(t);
    const rows = await t.client`
      SELECT id FROM member_group_change_requests WHERE member_id = 'mem_p'
    `;
    expect(rows).toHaveLength(1);
  });
});

/** Steps 4 and 5 of the migration, replayed against the fixture. */
async function runDataSteps(t: TestDb): Promise<void> {
  await t.client.unsafe(`
    INSERT INTO member_group_change_requests
      (id, member_id, from_group_id, to_group_id, status, requested_at)
    SELECT 'mgc_mig_' || m.id, m.id, NULL, m.primary_group_id, 'pending', m.created_at
      FROM members m
     WHERE m.status = 'pending'
       AND m.primary_group_id IS NOT NULL
       AND NOT EXISTS (
             SELECT 1 FROM member_group_change_requests r
              WHERE r.member_id = m.id AND r.status = 'pending'
           );

    UPDATE members SET primary_group_id = NULL, updated_at = now()
     WHERE status = 'pending' AND primary_group_id IS NOT NULL;

    INSERT INTO member_group_change_requests
      (id, member_id, from_group_id, to_group_id, status,
       requested_at, decided_at, decided_by, reason_category, reason_message)
    SELECT 'mgc_rej_' || m.id, m.id, NULL, m.primary_group_id, 'rejected',
           m.created_at, m.updated_at, 'system', 'other',
           'Diese Entscheidung stammt aus der Zeit vor der Begründungspflicht.'
      FROM members m
     WHERE m.status = 'inactive' AND m.joined_at IS NULL AND m.primary_group_id IS NOT NULL;

    UPDATE members SET status = 'pending', primary_group_id = NULL, updated_at = now()
     WHERE status = 'inactive' AND joined_at IS NULL;
  `);
}
