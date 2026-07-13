import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import {
  changePrimaryGroup,
  decideGroupChange,
  getGroupChangeHistory,
  getOpenGroupChange,
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

  it("moves a pending member straight through — nothing was approved yet", async () => {
    await createUser(t, "usr_pending", "pending@example.de");
    const m = await createProfile(t.db, {
      userId: "usr_pending",
      firstName: "Noch",
      lastName: "Wartend",
      primaryGroupId: "grp_a",
    });

    const res = await changePrimaryGroup(t.db, m.id, "grp_b", self("usr_pending"));

    expect(res.kind).toBe("applied");
    const after = await getMember(t.db, m.id);
    expect(after?.primaryGroupId).toBe("grp_b");
    expect(after?.status).toBe("pending");
    const rows = await t.client`SELECT id FROM member_group_change_requests`;
    expect(rows.length).toBe(0); // no request row for a pending member
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
    await expect(changePrimaryGroup(t.db, id, "grp_b", self("usr_attacker"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
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
      decideGroupChange(t.db, requestId, "rejected", boardOf("usr_a_board", "grp_a")),
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
      decideGroupChange(t.db, requestId, "rejected", boardOf("usr_b_board", "grp_b")),
    ).rejects.toMatchObject({ code: "CONFLICT" });
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
