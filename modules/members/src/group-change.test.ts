import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import {
  changePrimaryGroup,
  decideGroupChange,
  getGroupChangeHistory,
  getOpenGroupChange,
  listIncomingGroupChanges,
  listOpenGroupChanges,
  withdrawGroupChange,
} from "./services/group-change";
import { getMember } from "./services/get";
import { createProfile } from "./services/profile";
import { grantRole } from "./services/roles";
import { approveMember, transitionStatus } from "./services/status";
import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";
import type { Grant, MembersEvent } from "./index";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

const FEDERAL = {
  userId: "usr_federal",
  grants: [{ role: "federal_board", groupId: null }] as ReadonlyArray<Grant>,
};
const self = (userId: string) => ({
  userId,
  grants: [{ role: "member", groupId: null }] as ReadonlyArray<Grant>,
});
const boardOf = (userId: string, groupId: string) => ({
  userId,
  grants: [{ role: "local_board", groupId }] as ReadonlyArray<Grant>,
});

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

describeIfDb("changePrimaryGroup", () => {
  let t: TestDb;
  let events: MembersEvent[];

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    events = [];
    // The bus is type-keyed: one subscription per event type we assert on.
    for (const type of [
      "members.group_change.requested",
      "members.group_change.decided",
      "members.group_change.withdrawn",
      "members.role.revoked",
    ] as const) {
      getEventBus().subscribe(type, (e: MembersEvent) => {
        events.push(e);
      });
    }
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** An approved, active member of grp_a. */
  async function activeMember(userId: string): Promise<string> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Test",
      lastName: "Person",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, FEDERAL);
    return m.id;
  }

  it("files a request for an active member instead of moving them", async () => {
    const id = await activeMember("usr_active");
    const res = await changePrimaryGroup(t.db, id, "grp_b", self("usr_active"));

    expect(res.kind).toBe("requested");
    if (res.kind !== "requested") throw new Error("unreachable");
    expect(res.request.fromGroupId).toBe("grp_a");
    expect(res.request.toGroupId).toBe("grp_b");
    expect(res.request.status).toBe("pending");

    const after = await getMember(t.db, id);
    expect(after?.primaryGroupId).toBe("grp_a"); // NOT moved
    expect(after?.status).toBe("active");
    expect(events.some((e) => e.type === "members.group_change.requested")).toBe(true);
  });

  it("files a request for a pending member — nothing moves until a board approves", async () => {
    await createUser(t, "usr_pending", "pending@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_pending",
      firstName: "Noch",
      lastName: "Wartend",
    });

    const res = await changePrimaryGroup(t.db, m.id, "grp_b", self("usr_pending"));

    expect(res.kind).toBe("requested");
    const after = await getMember(t.db, m.id);
    expect(after?.primaryGroupId).toBeNull();
    expect(after?.status).toBe("pending");
    const rows = await t.client`SELECT id FROM member_group_change_requests`;
    expect(rows.length).toBe(1); // the application itself
  });

  it("applies an exit immediately, logs it, and revokes origin-group grants", async () => {
    const id = await activeMember("usr_leaver");
    await grantRole(t.db, id, "local_board", FEDERAL, "grp_a");

    const res = await changePrimaryGroup(t.db, id, null, self("usr_leaver"));

    expect(res.kind).toBe("applied");
    const after = await getMember(t.db, id);
    expect(after?.primaryGroupId).toBeNull();

    const [logged] = await t.client`
      SELECT status, from_group_id, to_group_id FROM member_group_change_requests
    `;
    expect(logged?.["status"]).toBe("approved");
    expect(logged?.["from_group_id"]).toBe("grp_a");
    expect(logged?.["to_group_id"]).toBeNull();

    const grants = await t.client`
      SELECT revoked_at FROM member_role_grants WHERE member_id = ${id} AND role = 'local_board'
    `;
    expect(grants[0]?.["revoked_at"]).not.toBeNull();
  });

  it("supersedes an open request when the member picks a different group", async () => {
    const id = await activeMember("usr_fickle");
    await createGroup(t, "grp_c", "koeln");

    const first = await changePrimaryGroup(t.db, id, "grp_b", self("usr_fickle"));
    const second = await changePrimaryGroup(t.db, id, "grp_c", self("usr_fickle"));

    expect(second.kind).toBe("requested");
    if (first.kind !== "requested" || second.kind !== "requested") throw new Error("unreachable");

    const rows = await t.client`
      SELECT id, status FROM member_group_change_requests ORDER BY requested_at
    `;
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r["id"] === first.request.id)?.["status"]).toBe("withdrawn");
    expect(rows.find((r) => r["id"] === second.request.id)?.["status"]).toBe("pending");
  });

  it("re-picking the current group withdraws the open request", async () => {
    const id = await activeMember("usr_reverter");
    await changePrimaryGroup(t.db, id, "grp_b", self("usr_reverter"));

    const res = await changePrimaryGroup(t.db, id, "grp_a", self("usr_reverter"));

    expect(res.kind).toBe("applied");
    const [row] = await t.client`SELECT status FROM member_group_change_requests`;
    expect(row?.["status"]).toBe("withdrawn");
    expect(events.some((e) => e.type === "members.group_change.withdrawn")).toBe(true);
  });

  it("withdrawGroupChange cancels the member's own open request", async () => {
    const id = await activeMember("usr_withdrawer");
    await changePrimaryGroup(t.db, id, "grp_b", self("usr_withdrawer"));

    const withdrawn = await withdrawGroupChange(t.db, id, self("usr_withdrawer"));
    expect(withdrawn?.status).toBe("withdrawn");

    const again = await withdrawGroupChange(t.db, id, self("usr_withdrawer"));
    expect(again).toBeNull(); // idempotent
  });

  it("refuses to move a member on someone else's behalf", async () => {
    const id = await activeMember("usr_victim");

    await expect(changePrimaryGroup(t.db, id, "grp_b", FEDERAL)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(changePrimaryGroup(t.db, id, "grp_b", self("usr_attacker"))).rejects.toMatchObject(
      {
        code: "FORBIDDEN",
      },
    );
  });

  it("refuses a transfer for an inactive member", async () => {
    const id = await activeMember("usr_gone");
    await transitionStatus(t.db, id, "inactive", FEDERAL);

    await expect(changePrimaryGroup(t.db, id, "grp_b", self("usr_gone"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describeIfDb("decideGroupChange", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** An active member of grp_a with an open request to grp_b. */
  async function pendingTransfer(userId: string): Promise<{ memberId: string; requestId: string }> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Test",
      lastName: "Person",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, FEDERAL);
    const res = await changePrimaryGroup(t.db, m.id, "grp_b", self(userId));
    if (res.kind !== "requested") throw new Error("expected a request");
    return { memberId: m.id, requestId: res.request.id };
  }

  /** Give a group an active local-board seat, so the federal fallback is off. */
  async function giveBoardSeat(userId: string, groupId: string): Promise<void> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Board",
      lastName: "Person",
      primaryGroupId: groupId,
    });
    await approveMember(t.db, m.id, FEDERAL);
    await grantRole(t.db, m.id, "local_board", FEDERAL, groupId);
  }

  it("approves: moves the member and closes the request", async () => {
    const { memberId, requestId } = await pendingTransfer("usr_mover");
    await giveBoardSeat("usr_b_board", "grp_b");

    const decided = await decideGroupChange(
      t.db,
      requestId,
      "approved",
      boardOf("usr_b_board", "grp_b"),
    );

    expect(decided.status).toBe("approved");
    expect(decided.decidedBy).toBe("usr_b_board");
    const after = await getMember(t.db, memberId);
    expect(after?.primaryGroupId).toBe("grp_b");
    expect(after?.status).toBe("active"); // status untouched
  });

  it("approves: revokes grants scoped to the group left behind", async () => {
    const { memberId, requestId } = await pendingTransfer("usr_exboard");
    await grantRole(t.db, memberId, "local_board", FEDERAL, "grp_a");
    await giveBoardSeat("usr_b_board", "grp_b");

    await decideGroupChange(t.db, requestId, "approved", boardOf("usr_b_board", "grp_b"));

    const grants = await t.client`
      SELECT revoked_at, revoked_by FROM member_role_grants
      WHERE member_id = ${memberId} AND group_id = 'grp_a'
    `;
    expect(grants[0]?.["revoked_at"]).not.toBeNull();
    expect(grants[0]?.["revoked_by"]).toBe("usr_b_board");
  });

  it("rejects: closes the request and leaves the member where they were", async () => {
    const { memberId, requestId } = await pendingTransfer("usr_rejected");
    await giveBoardSeat("usr_b_board", "grp_b");

    const decided = await decideGroupChange(
      t.db,
      requestId,
      "rejected",
      boardOf("usr_b_board", "grp_b"),
      { category: "no_contact", message: null },
    );

    expect(decided.status).toBe("rejected");
    const after = await getMember(t.db, memberId);
    expect(after?.primaryGroupId).toBe("grp_a");
  });

  it("the ORIGIN group's board may not decide — only the destination's", async () => {
    const { requestId } = await pendingTransfer("usr_held");
    await giveBoardSeat("usr_a_board", "grp_a");
    await giveBoardSeat("usr_b_board", "grp_b");

    await expect(
      decideGroupChange(t.db, requestId, "rejected", boardOf("usr_a_board", "grp_a"), {
        category: "no_contact",
        message: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("federal board may not decide when the destination has its own board", async () => {
    const { requestId } = await pendingTransfer("usr_fed");
    await giveBoardSeat("usr_b_board", "grp_b");

    await expect(decideGroupChange(t.db, requestId, "approved", FEDERAL)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("federal board decides as fallback when the destination has no board", async () => {
    const { memberId, requestId } = await pendingTransfer("usr_orphan");

    const decided = await decideGroupChange(t.db, requestId, "approved", FEDERAL);

    expect(decided.status).toBe("approved");
    const after = await getMember(t.db, memberId);
    expect(after?.primaryGroupId).toBe("grp_b");
  });

  it("a second decision on the same request conflicts", async () => {
    const { requestId } = await pendingTransfer("usr_twice");
    await giveBoardSeat("usr_b_board", "grp_b");

    await decideGroupChange(t.db, requestId, "approved", boardOf("usr_b_board", "grp_b"));
    await expect(
      decideGroupChange(t.db, requestId, "rejected", boardOf("usr_b_board", "grp_b"), {
        category: "no_contact",
        message: null,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  // A member who left and reapplies also has a request with `fromGroupId ===
  // null` — the same shape as a first-time application. `decideGroupChange`
  // must tell the two apart by the member's actual (still `active`) status,
  // not by that shape, or it would treat the rejoin as a first acceptance
  // and stamp over their real `joined_at`.
  it("approving a rejoin keeps the member's original joined_at", async () => {
    await createUser(t, "usr_returner", "returner@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_returner",
      firstName: "Rea",
      lastName: "Turner",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, FEDERAL);
    const original = await getMember(t.db, m.id);
    const originalJoinedAt = original?.joinedAt ?? null;
    if (originalJoinedAt === null) throw new Error("expected joinedAt to be stamped on approval");

    await changePrimaryGroup(t.db, m.id, null, self("usr_returner")); // leaves the group structure
    const res = await changePrimaryGroup(t.db, m.id, "grp_b", self("usr_returner")); // rejoins elsewhere
    if (res.kind !== "requested") throw new Error("expected a request");

    await giveBoardSeat("usr_b_board", "grp_b");
    await decideGroupChange(t.db, res.request.id, "approved", boardOf("usr_b_board", "grp_b"));

    const after = await getMember(t.db, m.id);
    expect(after?.primaryGroupId).toBe("grp_b");
    expect(after?.status).toBe("active");
    expect(after?.joinedAt?.getTime()).toBe(originalJoinedAt.getTime());
  });
});

describeIfDb("group change read services", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** An active member of grp_a with an open request to grp_b. */
  async function transferrer(userId: string): Promise<string> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Test",
      lastName: "Person",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, FEDERAL);
    await changePrimaryGroup(t.db, m.id, "grp_b", self(userId));
    return m.id;
  }

  it("getOpenGroupChange returns the member's open request, or null", async () => {
    const id = await transferrer("usr_open");
    const open = await getOpenGroupChange(t.db, id);
    expect(open?.toGroupId).toBe("grp_b");

    await withdrawGroupChange(t.db, id, self("usr_open"));
    expect(await getOpenGroupChange(t.db, id)).toBeNull();
  });

  it("listOpenGroupChanges: destination board sees it and may decide", async () => {
    await transferrer("usr_x");
    const open = await listOpenGroupChanges(t.db, boardOf("usr_b_board", "grp_b"));
    expect(open.length).toBe(1);
    expect(open[0]?.canDecide).toBe(true);
  });

  it("listOpenGroupChanges: origin board sees it but may NOT decide", async () => {
    await transferrer("usr_y");
    const open = await listOpenGroupChanges(t.db, boardOf("usr_a_board", "grp_a"));
    expect(open.length).toBe(1);
    expect(open[0]?.canDecide).toBe(false);
  });

  it("listOpenGroupChanges: an unrelated board sees nothing", async () => {
    await transferrer("usr_z");
    await createGroup(t, "grp_c", "koeln");
    const open = await listOpenGroupChanges(t.db, boardOf("usr_c_board", "grp_c"));
    expect(open.length).toBe(0);
  });

  it("listOpenGroupChanges: federal board sees every open request", async () => {
    await transferrer("usr_1");
    await transferrer("usr_2");
    const open = await listOpenGroupChanges(t.db, FEDERAL);
    expect(open.length).toBe(2);
  });

  it("getGroupChangeHistory returns newest first and refuses non-boards", async () => {
    const id = await transferrer("usr_hist");
    await withdrawGroupChange(t.db, id, self("usr_hist"));
    await changePrimaryGroup(t.db, id, "grp_b", self("usr_hist"));

    const history = await getGroupChangeHistory(t.db, id, FEDERAL);
    expect(history.length).toBe(2);
    expect(history[0]?.status).toBe("pending"); // newest first
    expect(history[1]?.status).toBe("withdrawn");

    await expect(getGroupChangeHistory(t.db, id, self("usr_nobody"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("getGroupChangeHistory is visible to the destination board too", async () => {
    const id = await transferrer("usr_dest");
    const history = await getGroupChangeHistory(t.db, id, boardOf("usr_b_board", "grp_b"));
    expect(history.length).toBe(1);
  });
});

describeIfDb("listIncomingGroupChanges", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** An active member of grp_a with an open request to grp_b. */
  async function applicant(userId: string, firstName: string): Promise<string> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName,
      lastName: "Bewerber",
      primaryGroupId: "grp_a",
    });
    await approveMember(t.db, m.id, FEDERAL);
    await changePrimaryGroup(t.db, m.id, "grp_b", self(userId));
    return m.id;
  }

  /** Give `groupId` a board seat of its own, so the federal fallback is off. */
  async function giveBoardSeat(userId: string, groupId: string): Promise<void> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Board",
      lastName: "Person",
      primaryGroupId: groupId,
    });
    await approveMember(t.db, m.id, FEDERAL);
    await grantRole(t.db, m.id, "local_board", FEDERAL, groupId);
  }

  it("the destination board sees the applicant, hydrated, and may decide", async () => {
    const memberId = await applicant("usr_cem", "Cem");
    await giveBoardSeat("usr_b_board", "grp_b");

    const incoming = await listIncomingGroupChanges(t.db, "grp_b", boardOf("usr_b_board", "grp_b"));

    expect(incoming.length).toBe(1);
    expect(incoming[0]?.memberId).toBe(memberId);
    expect(incoming[0]?.member.firstName).toBe("Cem");
    expect(incoming[0]?.member.primaryGroupId).toBe("grp_a"); // still in the group they are leaving
    expect(incoming[0]?.fromGroupId).toBe("grp_a");
    expect(incoming[0]?.canDecide).toBe(true);
  });

  it("the origin board has no inbound queue of its own", async () => {
    await applicant("usr_leaver", "Lena");
    await giveBoardSeat("usr_a_board", "grp_a");

    const incoming = await listIncomingGroupChanges(t.db, "grp_a", boardOf("usr_a_board", "grp_a"));
    expect(incoming.length).toBe(0);
  });

  it("an unrelated board sees nothing", async () => {
    await applicant("usr_x", "Xenia");
    await createGroup(t, "grp_c", "koeln");
    await giveBoardSeat("usr_c_board", "grp_c");

    const incoming = await listIncomingGroupChanges(t.db, "grp_b", boardOf("usr_c_board", "grp_c"));
    expect(incoming.length).toBe(0);
  });

  it("federal board decides as fallback when the destination has no board seat", async () => {
    await applicant("usr_orphan", "Ole");

    const incoming = await listIncomingGroupChanges(t.db, "grp_b", FEDERAL);
    expect(incoming.length).toBe(1);
    expect(incoming[0]?.canDecide).toBe(true);
  });

  it("federal board sees the queue but may not decide once the destination has a board", async () => {
    await applicant("usr_watched", "Wera");
    await giveBoardSeat("usr_b_board", "grp_b");

    const incoming = await listIncomingGroupChanges(t.db, "grp_b", FEDERAL);
    expect(incoming.length).toBe(1);
    expect(incoming[0]?.canDecide).toBe(false);
  });

  it("a decided request drops out of the queue", async () => {
    await applicant("usr_done", "Dana");
    await giveBoardSeat("usr_b_board", "grp_b");
    const board = boardOf("usr_b_board", "grp_b");

    const [open] = await listIncomingGroupChanges(t.db, "grp_b", board);
    if (!open) throw new Error("expected an inbound request");
    await decideGroupChange(t.db, open.id, "approved", board);

    expect(await listIncomingGroupChanges(t.db, "grp_b", board)).toEqual([]);
  });
});

describeIfDb("applications from the pool", () => {
  let t: TestDb;

  beforeAll(() => {
    process.env["SSO_JWT_SECRET"] = "x".repeat(48);
  });

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "berlin");
    await createUser(t, "usr_neu", "neu@example.de");
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_neu', 'usr_neu', 'Nina', 'Neu', NULL, 'pending')
    `;
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("files a request rather than writing the group", async () => {
    const res = await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    expect(res.kind).toBe("requested");
    const member = await getMember(t.db, "mem_neu");
    expect(member?.primaryGroupId).toBeNull();
  });

  it("emits members.group_change.requested", async () => {
    const seen: MembersEvent[] = [];
    getEventBus().subscribe<MembersEvent>("members.group_change.requested", async (e) => {
      seen.push(e);
    });
    await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    expect(seen).toHaveLength(1);
  });

  // Asserting the code, not just "it throws": a raw 23505 from the driver also
  // throws, and the wizard rethrows anything that is not an AppError — which
  // turned a second submit into a 500 instead of a message.
  it("allows only one open application at a time, as a conflict the caller can show", async () => {
    await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    await expect(
      changePrimaryGroup(t.db, "mem_neu", "grp_b", self("usr_neu")),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("treats re-submitting the same group as the same application", async () => {
    const first = await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    const again = await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    if (first.kind !== "requested" || again.kind !== "requested") {
      throw new Error("expected requests");
    }
    // Same row, so the applicant keeps their place in the queue.
    expect(again.request.id).toBe(first.request.id);
    expect(again.request.requestedAt).toEqual(first.request.requestedAt);
  });

  it("lets the applicant withdraw and apply elsewhere", async () => {
    await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    await withdrawGroupChange(t.db, "mem_neu", self("usr_neu"));
    const res = await changePrimaryGroup(t.db, "mem_neu", "grp_b", self("usr_neu"));
    expect(res.kind).toBe("requested");
  });

  it("sets the group and stamps joined_at on approval", async () => {
    const res = await changePrimaryGroup(t.db, "mem_neu", "grp_a", self("usr_neu"));
    if (res.kind !== "requested") throw new Error("expected a request");
    await decideGroupChange(t.db, res.request.id, "approved", FEDERAL);
    const member = await getMember(t.db, "mem_neu");
    expect(member?.primaryGroupId).toBe("grp_a");
    expect(member?.joinedAt).not.toBeNull();
  });
});

describeIfDb("rejection reasons", () => {
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
    await createUser(t, "usr_board", "board@example.de");
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
      VALUES ('mem_cem', 'usr_cem', 'Cem', 'Colak', NULL, 'pending')
    `;
    await t.client`
      INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status, joined_at)
      VALUES ('mem_board', 'usr_board', 'Bea', 'Board', 'grp_b', 'active', now())
    `;
    await grantRole(t.db, "mem_board", "local_board", FEDERAL, "grp_b");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  const apply = async () => {
    const res = await changePrimaryGroup(t.db, "mem_cem", "grp_b", self("usr_cem"));
    if (res.kind !== "requested") throw new Error("expected a request");
    return res.request.id;
  };

  it("stores category and message on rejection", async () => {
    const id = await apply();
    const decided = await decideGroupChange(t.db, id, "rejected", boardOf("usr_board", "grp_b"), {
      category: "no_contact",
      message: "Wir haben dich dreimal nicht erreicht.",
    });
    expect(decided.status).toBe("rejected");
    expect(decided.reasonCategory).toBe("no_contact");
    expect(decided.reasonMessage).toBe("Wir haben dich dreimal nicht erreicht.");
  });

  it("leaves the member groupless and pending after a rejection", async () => {
    const id = await apply();
    await decideGroupChange(t.db, id, "rejected", boardOf("usr_board", "grp_b"), {
      category: "no_contact",
      message: null,
    });
    const member = await getMember(t.db, "mem_cem");
    expect(member?.status).toBe("pending");
    expect(member?.primaryGroupId).toBeNull();
  });

  it("lets a rejected applicant apply to the same group again", async () => {
    const first = await apply();
    await decideGroupChange(t.db, first, "rejected", boardOf("usr_board", "grp_b"), {
      category: "no_contact",
      message: null,
    });
    const again = await changePrimaryGroup(t.db, "mem_cem", "grp_b", self("usr_cem"));
    expect(again.kind).toBe("requested");
  });

  it("refuses a rejection with no reason", async () => {
    const id = await apply();
    await expect(
      decideGroupChange(t.db, id, "rejected", boardOf("usr_board", "grp_b")),
    ).rejects.toThrow(/Grund/);
  });

  it("refuses category 'other' with no message", async () => {
    const id = await apply();
    await expect(
      decideGroupChange(t.db, id, "rejected", boardOf("usr_board", "grp_b"), {
        category: "other",
        message: null,
      }),
    ).rejects.toThrow(/Nachricht/);
  });

  it("stores no reason on approval", async () => {
    const id = await apply();
    const decided = await decideGroupChange(t.db, id, "approved", boardOf("usr_board", "grp_b"));
    expect(decided.reasonCategory).toBeNull();
  });

  it("refuses to decide a request whose member was deactivated", async () => {
    const id = await apply();
    await t.client`UPDATE members SET status = 'inactive' WHERE id = 'mem_cem'`;
    await expect(
      decideGroupChange(t.db, id, "approved", boardOf("usr_board", "grp_b")),
    ).rejects.toThrow(/nicht mehr/);
  });

  // Authorization must be checked before the member's state is disclosed: an
  // actor with no standing over the destination group must be told "you may
  // not decide this" (Forbidden), not "this member is deactivated"
  // (Conflict) — the latter would leak a third party's status to someone who
  // isn't entitled to decide anything about them. This pins the ORDER of the
  // two checks; swapping them back would turn this red without touching
  // either error message.
  it("tells an unauthorized actor they may not decide, not that the member was deactivated", async () => {
    const id = await apply();
    await t.client`UPDATE members SET status = 'inactive' WHERE id = 'mem_cem'`;
    await expect(
      decideGroupChange(t.db, id, "approved", boardOf("usr_outsider", "grp_a")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
