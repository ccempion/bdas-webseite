/**
 * Members integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 *
 * Pulls in the auth + groups migrations because the members tables FK both.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { createProfile, updateProfile } from "./services/profile";
import { MEMBERS_TEST_MIGRATIONS } from "./test-db";
import { approveMember, transitionStatus } from "./services/status";
import { grantRole, revokeRole } from "./services/roles";
import { listPendingMembers } from "./services/list-pending";
import { getGrants } from "./services/get";
import { listMembers } from "./services/list-members";
import { countMembersByStatus, signupsOverTime } from "./services/stats";
import { listGrantAudit, listRoleHolders } from "./services/role-views";
import type { Grant } from "./types";

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

const BOARD = {
  userId: "usr_board_actor",
  grants: [{ role: "federal_board", groupId: null }] as ReadonlyArray<Grant>,
};
const PEASANT = {
  userId: "usr_peasant_actor",
  grants: [{ role: "member", groupId: null }] as ReadonlyArray<Grant>,
};
const localBoardOf = (userId: string, groupId: string) => ({
  userId,
  grants: [{ role: "local_board", groupId }] as ReadonlyArray<Grant>,
});
const leadOf = (userId: string, groupId: string) => ({
  userId,
  grants: [{ role: "local_board_lead", groupId }] as ReadonlyArray<Grant>,
});

describeIfDb("members integration", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of MEMBERS_TEST_MIGRATIONS) {
      const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  async function createUser(id: string, email: string): Promise<void> {
    await t.client`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES (${id}, ${email}, ${email}, 'active')
    `;
  }

  async function createGroup(id: string, slug: string): Promise<void> {
    await t.client`
      INSERT INTO groups (id, slug, name, city, status)
      VALUES (${id}, ${slug}, ${slug}, 'Teststadt', 'active')
    `;
  }

  it("createProfile writes a pending row", async () => {
    await createUser("usr_alice", "alice@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_alice",
      firstName: "Alice",
      lastName: "Beispiel",
    });
    expect(m.id).toMatch(/^mem_/);
    expect(m.status).toBe("pending");
  });

  it("approveMember requires board authority and stamps joined_at", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_bob", "bob@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_bob",
      firstName: "Bob",
      lastName: "Beispiel",
      primaryGroupId: "grp_a",
    });

    await expect(approveMember(t.db, m.id, PEASANT)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const approved = await approveMember(t.db, m.id, BOARD);
    expect(approved.status).toBe("active");
    expect(approved.joinedAt).not.toBeNull();
  });

  it("local_board may approve only members of its own group", async () => {
    await createGroup("grp_a", "aachen");
    await createGroup("grp_b", "berlin");
    await createUser("usr_in_a", "a@example.de");
    await createUser("usr_in_b", "b@example.de");
    const inA = await createProfile(t.db, {
      userId: "usr_in_a",
      firstName: "InA",
      lastName: "x",
      primaryGroupId: "grp_a",
    });
    const inB = await createProfile(t.db, {
      userId: "usr_in_b",
      firstName: "InB",
      lastName: "x",
      primaryGroupId: "grp_b",
    });

    const boardA = localBoardOf("usr_board_a", "grp_a");

    // Same group → allowed.
    const approved = await approveMember(t.db, inA.id, boardA);
    expect(approved.status).toBe("active");

    // Other group → forbidden.
    await expect(approveMember(t.db, inB.id, boardA)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("local_board_lead may approve only members of its own group (ADR 0013)", async () => {
    await createGroup("grp_a", "aachen");
    await createGroup("grp_b", "berlin");
    await createUser("usr_lin_a", "la@example.de");
    await createUser("usr_lin_b", "lb@example.de");
    const inA = await createProfile(t.db, {
      userId: "usr_lin_a",
      firstName: "LeadInA",
      lastName: "x",
      primaryGroupId: "grp_a",
    });
    const inB = await createProfile(t.db, {
      userId: "usr_lin_b",
      firstName: "LeadInB",
      lastName: "x",
      primaryGroupId: "grp_b",
    });

    const leadA = leadOf("usr_lead_a", "grp_a");

    // Same group → allowed.
    const approved = await approveMember(t.db, inA.id, leadA);
    expect(approved.status).toBe("active");

    // Other group → forbidden.
    await expect(approveMember(t.db, inB.id, leadA)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("a member with no group can only be transitioned by federal_board", async () => {
    await createUser("usr_nogroup", "n@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_nogroup",
      firstName: "No",
      lastName: "Group",
    });
    await expect(approveMember(t.db, m.id, localBoardOf("usr_x", "grp_a"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const ok = await approveMember(t.db, m.id, BOARD);
    expect(ok.status).toBe("active");
  });

  /** Grants a real DB local_board seat to a throwaway member of `groupId`. */
  async function seatLocalBoard(userId: string, groupId: string): Promise<void> {
    await createUser(userId, `${userId}@example.de`);
    const seat = await createProfile(t.db, {
      userId,
      firstName: userId,
      lastName: "Seat",
      primaryGroupId: groupId,
    });
    await grantRole(t.db, seat.id, "local_board", BOARD, groupId);
  }

  it("federal_board may NOT decide a join for a group that has a local board (ADR 0021)", async () => {
    await createGroup("grp_a", "aachen");
    await seatLocalBoard("usr_seat_a", "grp_a");

    await createUser("usr_join_a", "ja@example.de");
    const pending = await createProfile(t.db, {
      userId: "usr_join_a",
      firstName: "Join",
      lastName: "A",
      primaryGroupId: "grp_a",
    });

    // Accept is the local board's call, not federal's...
    await expect(approveMember(t.db, pending.id, BOARD)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // ...and so is reject.
    await expect(transitionStatus(t.db, pending.id, "inactive", BOARD)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // The group's own board decides.
    const approved = await approveMember(t.db, pending.id, localBoardOf("usr_lb_a", "grp_a"));
    expect(approved.status).toBe("active");
  });

  it("federal_board decides a join only as fallback, when the group has no local board (ADR 0021)", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_join_b", "jb@example.de");
    const pending = await createProfile(t.db, {
      userId: "usr_join_b",
      firstName: "Join",
      lastName: "B",
      primaryGroupId: "grp_a",
    });

    // grp_a has zero local-board seats → federal may step in.
    const approved = await approveMember(t.db, pending.id, BOARD);
    expect(approved.status).toBe("active");
  });

  it("a revoked local_board seat re-opens the federal fallback (ADR 0021)", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_seat_r", "seatr@example.de");
    const seat = await createProfile(t.db, {
      userId: "usr_seat_r",
      firstName: "Seat",
      lastName: "R",
      primaryGroupId: "grp_a",
    });
    await grantRole(t.db, seat.id, "local_board", BOARD, "grp_a");

    await createUser("usr_join_c", "jc@example.de");
    const pending = await createProfile(t.db, {
      userId: "usr_join_c",
      firstName: "Join",
      lastName: "C",
      primaryGroupId: "grp_a",
    });

    // Seat occupied → federal locked out.
    await expect(approveMember(t.db, pending.id, BOARD)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // Seat vacated → fallback re-opens.
    await revokeRole(t.db, seat.id, "local_board", BOARD, "grp_a");
    const approved = await approveMember(t.db, pending.id, BOARD);
    expect(approved.status).toBe("active");
  });

  it("federal_board keeps authority over non-join transitions of a boarded group (ADR 0021)", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_act", "act@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_act",
      firstName: "Act",
      lastName: "x",
      primaryGroupId: "grp_a",
    });
    // Approve while the group is board-less (fallback), then seat a board.
    await approveMember(t.db, m.id, BOARD);
    await seatLocalBoard("usr_seat_n", "grp_a");

    // The member is no longer pending, so this is not a join decision: federal
    // retains deactivation/alumni authority even though grp_a has a board.
    const alumnus = await transitionStatus(t.db, m.id, "alumnus", BOARD);
    expect(alumnus.status).toBe("alumnus");
  });

  it("listPendingMembers: federal sees all, local sees only its group", async () => {
    await createGroup("grp_a", "aachen");
    await createGroup("grp_b", "berlin");
    for (const [u, g] of [
      ["usr_pa", "grp_a"],
      ["usr_pb", "grp_b"],
    ] as const) {
      await createUser(u, `${u}@example.de`);
      await createProfile(t.db, { userId: u, firstName: u, lastName: "x", primaryGroupId: g });
    }

    const all = await listPendingMembers(t.db, BOARD);
    expect(all.map((m) => m.firstName).sort()).toEqual(["usr_pa", "usr_pb"]);

    const onlyA = await listPendingMembers(t.db, localBoardOf("usr_ba", "grp_a"));
    expect(onlyA.map((m) => m.firstName)).toEqual(["usr_pa"]);

    // A lead of grp_a sees its group's pending members too (ADR 0013).
    const leadOnlyA = await listPendingMembers(t.db, leadOf("usr_la", "grp_a"));
    expect(leadOnlyA.map((m) => m.firstName)).toEqual(["usr_pa"]);

    await expect(listPendingMembers(t.db, PEASANT)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects illegal status transitions", async () => {
    await createUser("usr_d", "d@example.de");
    const m = await createProfile(t.db, { userId: "usr_d", firstName: "D", lastName: "x" });
    // pending → alumnus is not in the matrix
    await expect(transitionStatus(t.db, m.id, "alumnus", BOARD)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("grantRole/revokeRole: federal-only, scoped, idempotent, immediate", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_e", "e@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_e",
      firstName: "E",
      lastName: "x",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, BOARD);

    // Only federal_board may grant.
    await expect(grantRole(t.db, m.id, "local_board", PEASANT, "grp_a")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // local_board requires a group; federal_board must be unscoped.
    await expect(grantRole(t.db, m.id, "local_board", BOARD)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(grantRole(t.db, m.id, "federal_board", BOARD, "grp_a")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(grantRole(t.db, m.id, "not_a_role", BOARD)).rejects.toMatchObject({
      code: "VALIDATION",
    });

    // Grant is written and idempotent.
    await grantRole(t.db, m.id, "local_board", BOARD, "grp_a");
    await grantRole(t.db, m.id, "local_board", BOARD, "grp_a"); // idempotent
    expect(await getGrants(t.db, m.id)).toEqual([{ role: "local_board", groupId: "grp_a" }]);

    // The granted scope actually authorizes: usr_e now boards grp_a and can
    // approve a pending member of grp_a.
    await createUser("usr_pending_a", "pa@example.de");
    const pa = await createProfile(t.db, {
      userId: "usr_pending_a",
      firstName: "PA",
      lastName: "x",
      primaryGroupId: "grp_a",
    });
    const eActor = { userId: "usr_e", grants: await getGrants(t.db, m.id) };
    expect((await approveMember(t.db, pa.id, eActor)).status).toBe("active");

    // Revocation takes effect immediately (next read).
    await revokeRole(t.db, m.id, "local_board", BOARD, "grp_a");
    await revokeRole(t.db, m.id, "local_board", BOARD, "grp_a"); // idempotent
    expect(await getGrants(t.db, m.id)).toEqual([]);

    await createUser("usr_pending_a2", "pa2@example.de");
    const pa2 = await createProfile(t.db, {
      userId: "usr_pending_a2",
      firstName: "PA2",
      lastName: "x",
      primaryGroupId: "grp_a",
    });
    const eActorAfter = { userId: "usr_e", grants: await getGrants(t.db, m.id) };
    await expect(approveMember(t.db, pa2.id, eActorAfter)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("federal board may appoint a local_board_lead (migration 0003)", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_lead", "lead@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_lead",
      firstName: "L",
      lastName: "x",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, BOARD);

    // local_board_lead is group-scoped, like local_board.
    await expect(grantRole(t.db, m.id, "local_board_lead", BOARD)).rejects.toMatchObject({
      code: "VALIDATION",
    });

    await grantRole(t.db, m.id, "local_board_lead", BOARD, "grp_a");
    expect(await getGrants(t.db, m.id)).toContainEqual({
      role: "local_board_lead",
      groupId: "grp_a",
    });
  });

  it("listMembers filters by group, status, and search", async () => {
    await createGroup("grp_a", "aachen");
    await createGroup("grp_b", "bonn");
    await createUser("usr_la", "la@example.de");
    await createUser("usr_lb", "lb@example.de");
    const la = await createProfile(t.db, {
      userId: "usr_la",
      firstName: "Lena",
      lastName: "Anders",
      primaryGroupId: "grp_a",
    });
    await createProfile(t.db, {
      userId: "usr_lb",
      firstName: "Tom",
      lastName: "Berg",
      primaryGroupId: "grp_b",
    });
    await approveMember(t.db, la.id, BOARD); // la → active; tom stays pending

    const all = await listMembers(t.db, {});
    expect(all.length).toBe(2);

    const groupA = await listMembers(t.db, { groupId: "grp_a" });
    expect(groupA.map((m) => m.id)).toEqual([la.id]);

    const pending = await listMembers(t.db, { status: "pending" });
    expect(pending.every((m) => m.status === "pending")).toBe(true);

    const search = await listMembers(t.db, { search: "lena" });
    expect(search.map((m) => m.id)).toEqual([la.id]);
  });

  it("countMembersByStatus and signupsOverTime aggregate, group-scopable", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_s1", "s1@example.de");
    await createUser("usr_s2", "s2@example.de");
    const s1 = await createProfile(t.db, {
      userId: "usr_s1",
      firstName: "A",
      lastName: "A",
      primaryGroupId: "grp_a",
    });
    await createProfile(t.db, {
      userId: "usr_s2",
      firstName: "B",
      lastName: "B",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, s1.id, BOARD);

    const counts = await countMembersByStatus(t.db, {});
    expect(counts.active).toBe(1);
    expect(counts.pending).toBe(1);

    const series = await signupsOverTime(t.db, { days: 30 });
    const total = series.reduce((n, p) => n + p.count, 0);
    expect(total).toBe(2); // both created within the window
    expect(series.length).toBe(30); // one bucket per day, zero-filled

    const scoped = await countMembersByStatus(t.db, { groupId: "grp_a" });
    expect(scoped.active + scoped.pending).toBe(2);
  });

  it("a local_board_lead grants local_board within its group, but not across groups or higher roles", async () => {
    await createGroup("grp_a", "aachen");
    await createGroup("grp_b", "bonn");
    await createUser("usr_lead", "lead2@example.de");
    const lead = await createProfile(t.db, {
      userId: "usr_lead",
      firstName: "Lead",
      lastName: "x",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, lead.id, BOARD);
    await grantRole(t.db, lead.id, "local_board_lead", BOARD, "grp_a");
    const leadActor = { userId: "usr_lead", grants: await getGrants(t.db, lead.id) };

    // A member of grp_a to be promoted by the lead.
    await createUser("usr_member", "member@example.de");
    const member = await createProfile(t.db, {
      userId: "usr_member",
      firstName: "Mem",
      lastName: "x",
      primaryGroupId: "grp_a",
    });
    // grp_a now has a local board (the lead), so its join decisions belong to
    // that board, not federal (ADR 0021) — the lead approves.
    await approveMember(t.db, member.id, leadActor);

    // Lead CAN grant local_board within its own group...
    await grantRole(t.db, member.id, "local_board", leadActor, "grp_a");
    expect(await getGrants(t.db, member.id)).toContainEqual({
      role: "local_board",
      groupId: "grp_a",
    });

    // ...and CAN revoke it again.
    await revokeRole(t.db, member.id, "local_board", leadActor, "grp_a");
    expect(await getGrants(t.db, member.id)).not.toContainEqual({
      role: "local_board",
      groupId: "grp_a",
    });

    // Lead CANNOT grant local_board in another group.
    await expect(
      grantRole(t.db, member.id, "local_board", leadActor, "grp_b"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Lead CANNOT revoke local_board in another group either.
    await expect(
      revokeRole(t.db, member.id, "local_board", leadActor, "grp_b"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Lead CANNOT appoint another lead, nor grant federal_board.
    await expect(
      grantRole(t.db, member.id, "local_board_lead", leadActor, "grp_a"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(grantRole(t.db, member.id, "federal_board", leadActor)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("a lead may grant/revoke event_organizer scoped to its group (ADR 0017)", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_org", "org@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_org",
      firstName: "O",
      lastName: "x",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, BOARD);

    // event_organizer is group-scoped: a null scope is rejected.
    await expect(grantRole(t.db, m.id, "event_organizer", BOARD)).rejects.toMatchObject({
      code: "VALIDATION",
    });

    // A lead of the group may grant it.
    await grantRole(t.db, m.id, "event_organizer", leadOf("usr_lead", "grp_a"), "grp_a");
    expect(await getGrants(t.db, m.id)).toContainEqual({
      role: "event_organizer",
      groupId: "grp_a",
    });

    // ...and revoke it.
    await revokeRole(t.db, m.id, "event_organizer", leadOf("usr_lead", "grp_a"), "grp_a");
    expect(await getGrants(t.db, m.id)).not.toContainEqual({
      role: "event_organizer",
      groupId: "grp_a",
    });
  });

  it("a plain local_board member may NOT grant event_organizer", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_org2", "org2@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_org2",
      firstName: "O",
      lastName: "y",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, BOARD);

    await expect(
      grantRole(t.db, m.id, "event_organizer", localBoardOf("usr_lb", "grp_a"), "grp_a"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("listRoleHolders includes event_organizer grants", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_org3", "org3@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_org3",
      firstName: "Org",
      lastName: "Anita",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, BOARD);
    await grantRole(t.db, m.id, "event_organizer", BOARD, "grp_a");

    const holders = await listRoleHolders(t.db);
    expect(holders).toContainEqual(
      expect.objectContaining({ memberId: m.id, role: "event_organizer", groupId: "grp_a" }),
    );
  });

  it("listRoleHolders and listGrantAudit expose roster + history", async () => {
    await createGroup("grp_a", "aachen");
    await createUser("usr_h1", "h1@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_h1",
      firstName: "Lena",
      lastName: "Hofer",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, BOARD);
    await grantRole(t.db, m.id, "local_board_lead", BOARD, "grp_a");
    await grantRole(t.db, m.id, "local_board", BOARD, "grp_a");
    await revokeRole(t.db, m.id, "local_board", BOARD, "grp_a");

    const holders = await listRoleHolders(t.db);
    // Only ACTIVE board grants; the revoked local_board is gone.
    expect(holders).toEqual([
      expect.objectContaining({
        memberId: m.id,
        firstName: "Lena",
        lastName: "Hofer",
        role: "local_board_lead",
        groupId: "grp_a",
      }),
    ]);

    const audit = await listGrantAudit(t.db, {});
    // Newest-first; includes the revoked row with revokedAt set.
    expect(audit.length).toBe(2);
    expect(audit.some((a) => a.role === "local_board" && a.revokedAt !== null)).toBe(true);
    const revoked = audit.find((a) => a.role === "local_board" && a.revokedAt !== null);
    expect(revoked?.revokedBy).toBe(BOARD.userId);
    expect(audit.every((a) => a.firstName === "Lena")).toBe(true);

    const scoped = await listGrantAudit(t.db, { groupId: "grp_a" });
    expect(scoped.length).toBe(2);
  });
});
