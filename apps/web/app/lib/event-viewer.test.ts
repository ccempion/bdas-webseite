import { describe, expect, it } from "vitest";

import { viewerFrom } from "../../lib/event-viewer";

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
