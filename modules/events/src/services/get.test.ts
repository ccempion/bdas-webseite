import { describe, expect, it } from "vitest";

import { ANON, canManage, type Viewer } from "./get";

const organizerOf = (groupId: string): Viewer => ({ ...ANON, organizerGroupIds: [groupId] });

describe("canManage with event_organizer", () => {
  it("an organizer manages events in its group", () => {
    expect(canManage(organizerOf("grp_a"), { groupId: "grp_a" })).toBe(true);
  });

  it("an organizer cannot manage another group's events", () => {
    expect(canManage(organizerOf("grp_a"), { groupId: "grp_b" })).toBe(false);
  });

  it("an organizer cannot manage federation-wide (null group) events", () => {
    expect(canManage(organizerOf("grp_a"), { groupId: null })).toBe(false);
  });

  it("federal board still manages everything", () => {
    expect(canManage({ ...ANON, isFederal: true }, { groupId: "grp_a" })).toBe(true);
  });
});
