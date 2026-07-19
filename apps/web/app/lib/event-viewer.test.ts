import { describe, expect, it } from "vitest";

import { canManageAny, viewerFrom } from "../../lib/event-viewer";

describe("viewerFrom", () => {
  it("maps event_organizer grants into organizerGroupIds", () => {
    const v = viewerFrom({
      user: { id: "usr_1" },
      member: { status: "active", primaryGroupId: "grp_a" },
      grants: [{ role: "event_organizer", groupId: "grp_a" }],
    } as never);
    expect(v.organizerGroupIds).toEqual(["grp_a"]);
    expect(v.boardGroupIds).toEqual([]);
  });
});

describe("canManageAny", () => {
  it("is false for anonymous and plain members", () => {
    expect(canManageAny(viewerFrom(null))).toBe(false);
    expect(
      canManageAny(
        viewerFrom({
          user: { id: "usr_1" },
          member: { status: "active", primaryGroupId: "grp_a" },
          grants: [],
        } as never),
      ),
    ).toBe(false);
  });

  it("is true for federal, local board, and event organizers", () => {
    const federal = viewerFrom({
      user: { id: "u" },
      member: { status: "active", primaryGroupId: "grp_a" },
      grants: [{ role: "federal_board", groupId: null }],
    } as never);
    const board = viewerFrom({
      user: { id: "u" },
      member: { status: "active", primaryGroupId: "grp_a" },
      grants: [{ role: "local_board", groupId: "grp_a" }],
    } as never);
    const organizer = viewerFrom({
      user: { id: "u" },
      member: { status: "active", primaryGroupId: "grp_a" },
      grants: [{ role: "event_organizer", groupId: "grp_a" }],
    } as never);
    expect(canManageAny(federal)).toBe(true);
    expect(canManageAny(board)).toBe(true);
    expect(canManageAny(organizer)).toBe(true);
  });
});
