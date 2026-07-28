import { describe, expect, it } from "vitest";

import type { GroupChangeRequest, Member } from "@bdas/members";

import { buildGroupTimeline } from "./group-history";

const member: Member = {
  id: "mem_1",
  userId: "usr_1",
  firstName: "Cem",
  lastName: "Colak",
  primaryGroupId: "grp_koeln",
  status: "active",
  joinedAt: new Date("2025-05-18T00:00:00Z"),
  createdAt: new Date("2025-05-01T00:00:00Z"),
  updatedAt: new Date("2026-07-10T00:00:00Z"),
};

const req = (over: Partial<GroupChangeRequest>): GroupChangeRequest => ({
  id: "mgc_x",
  memberId: "mem_1",
  fromGroupId: null,
  toGroupId: null,
  status: "approved",
  requestedAt: new Date("2026-01-01T00:00:00Z"),
  decidedAt: new Date("2026-01-02T00:00:00Z"),
  decidedBy: "usr_board",
  reasonCategory: null,
  reasonMessage: null,
  ...over,
});

describe("buildGroupTimeline", () => {
  it("appends the federation join derived from joinedAt, oldest last", () => {
    const entries = buildGroupTimeline(member, [
      req({
        id: "mgc_2",
        fromGroupId: "grp_aachen",
        toGroupId: "grp_koeln",
        status: "pending",
        requestedAt: new Date("2026-07-10T00:00:00Z"),
        decidedAt: null,
        decidedBy: null,
      }),
      req({
        id: "mgc_1",
        fromGroupId: "grp_bonn",
        toGroupId: "grp_aachen",
        requestedAt: new Date("2026-03-02T00:00:00Z"),
      }),
    ]);

    expect(entries.map((e) => e.kind)).toEqual(["pending", "approved", "join"]);
    // The join lands in the oldest request's ORIGIN group, not the current one.
    expect(entries[2]?.toGroupId).toBe("grp_bonn");
    expect(entries[2]?.at).toEqual(member.joinedAt);
  });

  it("dates a pending entry by when it was requested, a decided one by when it was decided", () => {
    const entries = buildGroupTimeline(member, [
      req({
        id: "mgc_open",
        fromGroupId: "grp_koeln",
        toGroupId: "grp_bonn",
        status: "pending",
        requestedAt: new Date("2026-07-10T00:00:00Z"),
        decidedAt: null,
        decidedBy: null,
      }),
    ]);

    expect(entries[0]?.at).toEqual(new Date("2026-07-10T00:00:00Z"));
  });

  it("falls back to the current group for a member who never moved", () => {
    const entries = buildGroupTimeline(member, []);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("join");
    expect(entries[0]?.toGroupId).toBe("grp_koeln");
  });

  it("emits nothing for a member who never joined and never moved", () => {
    expect(buildGroupTimeline({ ...member, joinedAt: null }, [])).toEqual([]);
  });
});
