import { describe, expect, it } from "vitest";

import { ANON, canCreateFor, canManage, type Viewer } from "./get";

const organizerOf = (groupId: string): Viewer => ({ ...ANON, organizerGroupIds: [groupId] });
const ev = (groupId: string | null, createdBy = "usr_other") => ({ groupId, createdBy });

describe("canManage with event_organizer", () => {
  it("an organizer manages events in its group", () => {
    expect(canManage(organizerOf("grp_a"), ev("grp_a"))).toBe(true);
  });

  it("an organizer cannot manage another group's events", () => {
    expect(canManage(organizerOf("grp_a"), ev("grp_b"))).toBe(false);
  });

  it("an organizer cannot manage federation-wide (null group) events", () => {
    expect(canManage(organizerOf("grp_a"), ev(null))).toBe(false);
  });

  it("federal board still manages everything", () => {
    expect(canManage({ ...ANON, isFederal: true }, ev("grp_a"))).toBe(true);
  });
});

describe("canManage for an organizer limited to its own events (ADR 0047)", () => {
  const own: Viewer = { ...organizerOf("grp_bdaj"), userId: "usr_me", ownEventsOnly: true };

  it("manages an event it created", () => {
    expect(canManage(own, ev("grp_bdaj", "usr_me"))).toBe(true);
  });

  it("does not manage another organizer's event in the same group", () => {
    expect(canManage(own, ev("grp_bdaj", "usr_other"))).toBe(false);
  });

  it("without a user id manages nothing", () => {
    expect(canManage({ ...own, userId: null }, ev("grp_bdaj", "usr_me"))).toBe(false);
  });

  it("a group's Lead keeps every event of the group", () => {
    expect(canManage({ ...own, boardGroupIds: ["grp_bdaj"] }, ev("grp_bdaj"))).toBe(true);
  });

  it("federal board keeps every event", () => {
    expect(canManage({ ...own, isFederal: true }, ev("grp_bdaj"))).toBe(true);
  });

  it("an organizer with a Hochschulgruppe still manages every event of the group", () => {
    expect(canManage(organizerOf("grp_a"), ev("grp_a", "usr_other"))).toBe(true);
  });
});

describe("canCreateFor", () => {
  it("lets an organizer limited to its own events create in its group", () => {
    const own: Viewer = { ...organizerOf("grp_bdaj"), userId: "usr_me", ownEventsOnly: true };
    expect(canCreateFor(own, "grp_bdaj")).toBe(true);
    expect(canCreateFor(own, "grp_a")).toBe(false);
  });

  it("keeps federation-wide events to the federal board", () => {
    expect(canCreateFor(organizerOf("grp_a"), null)).toBe(false);
    expect(canCreateFor({ ...ANON, isFederal: true }, null)).toBe(true);
  });
});
